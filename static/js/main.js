const btn = document.getElementById('menu-btn');
  const menu = document.getElementById('menu');
  let open = false;

  btn.addEventListener('click', () => {
    open = !open;
    menu.classList.toggle('opacity-0', !open);
    menu.classList.toggle('translate-y-0', open);
    menu.classList.toggle('-translate-y-4', !open);
    menu.classList.toggle('pointer-events-none', !open);

    // Ikona zmienia się na X
    btn.innerHTML = open
      ? '<i class="fa-solid fa-xmark"></i>'
      : '<i class="fa-solid fa-bars"></i>';
  });