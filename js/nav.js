// Hash routing helper, so the phone's Back button works inside the app.
export function go(route, { replace = false } = {}) {
  const target = "#/" + route;
  if (replace) {
    location.replace(target);
  } else if (location.hash !== target) {
    location.hash = target;
  } else {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
}
