document.addEventListener('DOMContentLoaded', () => {
  // 1. Remove any old legacy sidebar toggle buttons
  const oldToggles = document.querySelectorAll('.sidebar-toggle, #sidebarToggle');
  oldToggles.forEach(btn => btn.remove());

  // 2. Inject Sidebar Overlay
  if (!document.querySelector('.sidebar-overlay')) {
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.onclick = toggleSidebar;
    document.body.appendChild(overlay);
  }

  // 3. Inject Hamburger Button into Standard Topbar
  const topbar = document.querySelector('.topbar');
  if (topbar && !document.querySelector('.mobile-menu-btn')) {
    const title = topbar.querySelector('h1') || topbar.querySelector('h2');
    
    const leftWrapper = document.createElement('div');
    leftWrapper.className = 'topbar-left';
    
    const btn = document.createElement('button');
    btn.className = 'mobile-menu-btn';
    btn.innerHTML = '<i class="fas fa-bars"></i>';
    btn.onclick = toggleSidebar;
    
    leftWrapper.appendChild(btn);
    if (title) {
       title.parentNode.insertBefore(leftWrapper, title);
       leftWrapper.appendChild(title);
    } else {
       topbar.insertBefore(btn, topbar.firstChild);
    }
  }

  // 4. Inject Hamburger Button into Tailwind Subject Master Page
  const twHeader = document.querySelector('.flex.justify-between.items-center.mb-8');
  if (twHeader && !topbar && !document.querySelector('.mobile-menu-btn')) {
    const titleDiv = twHeader.children[0];
    if (titleDiv) {
      const leftWrapper = document.createElement('div');
      leftWrapper.style.display = 'flex';
      leftWrapper.style.alignItems = 'flex-start';
      leftWrapper.style.gap = '16px';
      
      const btn = document.createElement('button');
      btn.className = 'mobile-menu-btn';
      btn.innerHTML = '<i class="fas fa-bars"></i>';
      btn.onclick = toggleSidebar;
      btn.style.marginTop = '4px';
      
      twHeader.insertBefore(leftWrapper, titleDiv);
      leftWrapper.appendChild(btn);
      leftWrapper.appendChild(titleDiv);
    }
  }

  // Close sidebar when clicking a navigation link (for mobile)
  const navLinks = document.querySelectorAll('.sidebar-nav .nav-link, .sidebar .nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 992) {
        // Only close if it's currently open, don't accidentally open it
        const sidebar = document.querySelector('.sidebar');
        if (sidebar && sidebar.classList.contains('open')) {
          toggleSidebar();
        }
      }
    });
  });
});

window.toggleSidebar = function() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  if(sidebar) sidebar.classList.toggle('open');
  if(overlay) overlay.classList.toggle('active');
};
