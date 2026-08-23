const ACTIVE_NAV_ITEMS = Object.freeze([
  { label: "原物料市場", href: "/" },
  { label: "加工市場參考", href: "/machining" },
]);

function currentPagePath() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === "/machining.html" ? "/machining" : path;
}

function renderSiteNavigation() {
  const nav = document.querySelector("[data-site-nav]");
  if (!nav) return;
  const current = currentPagePath();
  nav.innerHTML = ACTIVE_NAV_ITEMS.map((item) => {
    const active = current === item.href;
    return `<a class="site-nav-link${active ? " active" : ""}" href="${item.href}"${active ? ' aria-current="page"' : ""}>${item.label}</a>`;
  }).join("");
}

renderSiteNavigation();
