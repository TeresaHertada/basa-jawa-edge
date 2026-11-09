/* School/team profile: independent of the trained model and learning modules. */
(() => {
  'use strict';
  const CONFIG = './school-profile.json';
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  function validate(data) {
    if (!data || typeof data.school_name !== 'string' || !data.school_name.trim()) throw Error('Nama sekolah belum diisi.');
    for (const key of ['members', 'supervisors']) {
      if (!Array.isArray(data[key]) || !data[key].length || data[key].some(name => typeof name !== 'string' || !name.trim())) throw Error('Daftar anggota/pembimbing belum lengkap.');
    }
    if (!/^assets\/school-logo\.(png|jpg|jpeg|webp)$/.test(data.logo_path || '')) throw Error('Lokasi logo harus berupa aset sekolah lokal.');
    return data;
  }
  function image(data, className) {
    const img = make('img', className);
    img.src = './' + data.logo_path;
    img.alt = 'Logo ' + data.school_name;
    img.width = 80;
    img.height = 80;
    img.decoding = 'async';
    return img;
  }
  function people(title, names) {
    const group = make('div', 'school-people-group');
    group.append(make('h3', '', title));
    const list = make('ul', 'school-name-list');
    names.forEach(name => list.append(make('li', '', name)));
    group.append(list);
    return group;
  }
  function card(data, id, about = false) {
    const section = make('section', 'school-profile-card' + (about ? ' school-profile-about' : ''));
    section.id = id;
    section.setAttribute('aria-label', 'Identitas sekolah dan tim pengembang');
    const summary = make('div', 'school-summary');
    summary.append(image(data, 'school-profile-logo'));
    const title = make('div', 'school-summary-copy');
    title.append(make('p', 'school-kicker', about ? 'TIM PENGEMBANG' : 'PROYEK SISWA'));
    title.append(make('h2', 'school-title', data.school_name));
    title.append(make('p', 'school-team-name', data.team_name || 'Tim BASA-JAWA Edge'));
    summary.append(title);
    section.append(summary);
    const grid = make('div', 'school-people-grid');
    grid.append(people('Anggota kelompok', data.members), people('Guru pembimbing', data.supervisors));
    section.append(grid);
    return section;
  }
  async function init() {
    try {
      const response = await fetch(CONFIG);
      if (!response.ok) throw Error('Identitas sekolah gagal dimuat.');
      const data = validate(await response.json());
      const home = document.getElementById('home-school-profile');
      const help = document.getElementById('help-school-profile');
      if (home) {
        home.replaceChildren(card(data, 'school-profile-home'));
        document.getElementById('home-team-details').hidden = false;
      }
      if (help) help.replaceChildren(card(data, 'school-profile-about', true));
      document.querySelectorAll('.brand-mark').forEach(mark => {
        const logo = image(data, 'school-brand-image');
        logo.addEventListener('error', () => { mark.classList.remove('school-brand-mark'); mark.textContent = 'Bj'; }, {once:true});
        mark.classList.add('school-brand-mark');
        mark.replaceChildren(logo);
      });
      const credit = document.querySelector('.side-credit');
      if (credit) credit.textContent = data.school_name;
      const footerBrand = document.querySelector('.page-footer > span');
      if (footerBrand && !footerBrand.querySelector('.school-footer-label')) footerBrand.append(make('span', 'school-footer-label', data.school_name));
    } catch (error) {
      // A profile problem leaves the learning application operational.
      console.warn('BASA-JAWA: identitas sekolah belum dimuat.', error.message);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
