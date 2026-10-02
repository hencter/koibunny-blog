const menuToggle = document.querySelector("#menuToggle");
const mainNav = document.querySelector("#mainNav");
const searchInput = document.querySelector("#searchInput");
const cards = [...document.querySelectorAll(".article-card")];
const emptyState = document.querySelector("#emptyState");

menuToggle?.addEventListener("click", () => {
  const open = mainNav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(open));
});

document.querySelectorAll(".main-nav a").forEach(link => {
  link.addEventListener("click", () => {
    mainNav.classList.remove("open");
    menuToggle?.setAttribute("aria-expanded", "false");
  });
});

searchInput?.addEventListener("input", (event) => {
  const query = event.target.value.trim().toLowerCase();
  let visible = 0;

  cards.forEach(card => {
    const haystack = `${card.innerText} ${card.dataset.search || ""}`.toLowerCase();
    const match = !query || haystack.includes(query);
    card.hidden = !match;
    if (match) visible += 1;
  });

  emptyState.hidden = visible !== 0;
});
