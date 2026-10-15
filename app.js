// Optional Supabase integration. Without project settings, the site remains in local demo mode.
(async function startSharedComplaints() {
  const url = window.PARKSIDE_SUPABASE_URL;
  const key = window.PARKSIDE_SUPABASE_ANON_KEY;
  const notice = document.querySelector('.login-notice');
  const loginMessage = document.querySelector('#login-message');
  const panel = document.querySelector('#admin-panel');
  const photoInput = document.querySelector('#photo');
  const photoPreview = document.querySelector('#photo-preview');
  const photoThumbnail = document.querySelector('#photo-thumbnail');
  let previewUrl = null;
  photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    photoPreview.classList.remove('visible');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      photoInput.value = '';
      window.alert('Choose a JPG, PNG, or WebP image up to 5 MB.');
      return;
    }
    previewUrl = URL.createObjectURL(file);
    photoThumbnail.src = previewUrl;
    document.querySelector('#photo-name').textContent = file.name;
    photoPreview.classList.add('visible');
  });
  if (!url || !key) {
    notice.textContent = 'Shared admin access is not connected yet. Create a Supabase project, run supabase-setup.sql, and add its project URL and publishable key to supabase-config.js.';
    document.querySelector('.photo-help').textContent = 'JPG, PNG, or WebP · Up to 5 MB. Photo upload will work after shared storage is connected.';
    document.querySelector('#report-form').addEventListener('submit', event => {
      if (photoInput.files.length) {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.alert('Photo upload is not connected yet. Set up the shared Supabase storage first; your complaint has not been submitted.');
      }
    }, true);
    return;
  }

  let client;
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    client = createClient(url, key);
  } catch (error) {
    notice.textContent = 'The shared complaint service could not load. Check the internet connection and Supabase settings.';
    return;
  }

  let adminSession = null;
  reports = [];
  render();
  updateStats();

  function updateStats() {
    document.querySelector('#stat-total').textContent = reports.length;
    document.querySelector('#stat-resolved').textContent = reports.filter(r => r.status === 'Resolved').length;
    document.querySelector('#stat-parks').textContent = new Set(reports.map(r => r.park.toLowerCase())).size;
  }

  function friendlyDate(value) {
    if (!value) return 'Recently';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Recently' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
  }

  async function loadReports() {
    const rows = [];
    let error = null;
    for (let offset = 0; ; offset += 1000) {
      let query = client.from('complaints').select('id,title,park,location,category,description,status,created_at').order('created_at', { ascending: false });
      if (adminSession) query = client.from('complaints').select('id,title,park,location,category,description,status,created_at,photo_path,complaint_contacts(email)').order('created_at', { ascending: false });
      const page = await query.range(offset, offset + 999);
      if (page.error) { error = page.error; break; }
      rows.push(...(page.data || []));
      if (!page.data || page.data.length < 1000) break;
    }
    if (error) {
      document.querySelector('#report-list').innerHTML = '<div class="empty">Could not load shared reports. Check the Supabase setup.</div>';
      document.querySelector('#admin-list').innerHTML = adminSession ? `<div class="admin-error">${esc(error.message)}</div>` : '';
      return;
    }
    reports = rows.map(row => ({ ...row, date: friendlyDate(row.created_at) }));
    render();
    updateStats();
    await renderAdmin();
  }

  async function renderAdmin() {
    if (!adminSession) return;
    panel.classList.add('visible');
    document.querySelector('#admin-email-label').textContent = adminSession.user.email || '';
    document.querySelector('#admin-count').textContent = `${reports.length} ${reports.length === 1 ? 'complaint' : 'complaints'}`;
    document.querySelector('#admin-list').innerHTML = reports.length ? (await Promise.all(reports.map(async r => {
      const contact = Array.isArray(r.complaint_contacts) ? r.complaint_contacts[0] : r.complaint_contacts;
      let photo = '';
      if (r.photo_path) {
        const { data } = await client.storage.from('complaint-photos').createSignedUrl(r.photo_path, 3600);
        if (data?.signedUrl) photo = `<p><a href="${esc(data.signedUrl)}" target="_blank" rel="noopener">View attached photo</a></p>`;
      }
      return `<article class="admin-report"><div><strong>${esc(r.title)}</strong><p>${esc(r.park)}${r.location ? ' · ' + esc(r.location) : ''} · ${esc(r.category)} · ${esc(r.date)}</p><p>${esc(r.description)}</p><small>Reporter email: ${contact?.email ? esc(contact.email) : 'Not provided'}</small>${photo}</div><label><span class="sr-only">Update status for ${esc(r.title)}</span><select data-report-id="${esc(r.id)}" aria-label="Update status for ${esc(r.title)}"><option ${r.status === 'Open' ? 'selected' : ''}>Open</option><option ${r.status === 'In progress' ? 'selected' : ''}>In progress</option><option ${r.status === 'Resolved' ? 'selected' : ''}>Resolved</option></select></label></article>`;
    }))).join('') : '<div class="empty">No complaints have been submitted yet.</div>';
  }

  async function verifyAdmin(session) {
    if (!session) return false;
    const { data, error } = await client.rpc('is_admin');
    return !error && data === true;
  }

  document.querySelector('#admin-form').addEventListener('submit', async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    loginMessage.classList.remove('show');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Signing in…';
    const form = new FormData(event.currentTarget);
    const { data, error } = await client.auth.signInWithPassword({ email: form.get('admin-email'), password: form.get('admin-password') });
    if (error) {
      loginMessage.textContent = 'Sign-in failed. Check the email and password, then try again.';
      loginMessage.classList.add('show');
    } else if (!(await verifyAdmin(data.session))) {
      await client.auth.signOut();
      loginMessage.textContent = 'This account is not on the administrator list.';
      loginMessage.classList.add('show');
    } else {
      adminSession = data.session;
      event.currentTarget.reset();
      document.querySelector('#admin-dialog').close();
      await loadReports();
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    button.disabled = false;
    button.textContent = 'Sign in';
  }, true);

  document.querySelector('#report-form').addEventListener('submit', async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const formElement = event.currentTarget;
    if (!formElement.reportValidity()) return;
    const form = new FormData(formElement);
    const photoFile = form.get('photo');
    const button = formElement.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Submitting…';
    const { data, error } = await client.from('complaints').insert({
      title: form.get('title').trim(), park: form.get('park').trim(), category: form.get('category'),
      location: form.get('location').trim(), description: form.get('description').trim(), status: 'Open'
    }).select('id').single();
    if (error) {
      window.alert('The complaint could not be saved. Please try again.');
    } else {
      let contactFailed = false;
      const email = form.get('email').trim();
      if (email) {
        const result = await client.from('complaint_contacts').insert({ complaint_id: data.id, email });
        contactFailed = Boolean(result.error);
      }
      let photoFailed = false;
      if (photoFile && photoFile.size) {
        const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[photoFile.type];
        const path = `${crypto.randomUUID()}.${extension}`;
        const uploaded = await client.storage.from('complaint-photos').upload(path, photoFile, { contentType: photoFile.type, upsert: false });
        if (uploaded.error) photoFailed = true;
        else {
          const attached = await client.rpc('attach_complaint_photo', { target_complaint_id: data.id, target_photo_path: path });
          photoFailed = Boolean(attached.error);
        }
      }
      formElement.reset();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
      photoPreview.classList.remove('visible');
      await loadReports();
      const toast = document.querySelector('#toast');
      toast.textContent = photoFailed ? 'Complaint saved, but the photo could not be uploaded.' : contactFailed ? 'Complaint saved. The update email could not be saved; please contact the parks team directly.' : 'Your complaint was submitted. Thanks for caring for your park!';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 4500);
      document.querySelector('#reports').scrollIntoView({ behavior: 'smooth' });
    }
    button.disabled = false;
    button.textContent = 'Submit community report';
  }, true);

  document.querySelector('#admin-list').addEventListener('change', async event => {
    const select = event.target.closest('select[data-report-id]');
    if (!select || !adminSession) return;
    select.disabled = true;
    const { error } = await client.from('complaints').update({ status: select.value }).eq('id', select.dataset.reportId);
    if (error) {
      window.alert('The status could not be updated. Please try again.');
      select.disabled = false;
    } else {
      await loadReports();
    }
  });

  document.querySelector('#admin-logout').addEventListener('click', async () => {
    await client.auth.signOut();
    adminSession = null;
    panel.classList.remove('visible');
    await loadReports();
  });

  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session && await verifyAdmin(sessionData.session)) adminSession = sessionData.session;
  else if (sessionData.session) await client.auth.signOut();
  await loadReports();
})();
