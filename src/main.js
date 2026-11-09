const banner = document.getElementById('cookie-banner');
const hideBanner = () => {
  banner.hidden = true;
};
const showBanner = () => {
  banner.hidden = false;
};

['cookie-close', 'cookie-accept', 'cookie-decline', 'cookie-settings'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', hideBanner);
});

const footerCookies = document.getElementById('footer-cookies');
if (footerCookies) {
  footerCookies.addEventListener('click', (e) => {
    e.preventDefault();
    showBanner();
    window.scrollTo({ top: 0 });
  });
}

const input = document.getElementById('username');
const submit = document.getElementById('submit');
const form = document.getElementById('login-form');

if (input && submit) {
  input.addEventListener('input', () => {
    submit.classList.toggle('is-ready', input.value.trim().length > 0);
  });
}

// For now the sign-in is open: "Continuar" enters without email or password.
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    window.location.href = './contacts/';
  });
}
