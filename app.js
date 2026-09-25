const root = document.documentElement;
const video = document.querySelector('#city-video');
const motionButton = document.querySelector('.motion-button');
const experience = document.querySelector('#experience');
const experienceTitle = document.querySelector('#experience-title');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let userPaused = false;
let inView = true;

function updateButton() {
  const state = video.ended ? 'ended' : video.paused ? 'paused' : 'playing';
  motionButton.dataset.state = state;
  motionButton.setAttribute('aria-label', state === 'playing' ? 'Pause city animation' : state === 'ended' ? 'Replay city animation' : 'Play city animation');
}

async function startVideo() {
  // Muted inline autoplay is explicitly requested. The visible pause control remains available.
  if (userPaused || document.hidden || !inView || root.classList.contains('findings-active') || video.ended) return;
  video.muted = true;
  try { await video.play(); } catch { /* Browser policy can require the visible Play control. */ }
  updateButton();
}

video.addEventListener('loadeddata', () => {
  root.classList.add('video-ready');
  motionButton.hidden = false;
  startVideo();
}, { once: true });
video.addEventListener('play',()=>{if(root.classList.contains('findings-active'))video.pause();});
document.addEventListener('steadmorrow:step',()=>{if(root.classList.contains('findings-active'))video.pause();else startVideo();});
['play', 'pause', 'ended'].forEach(event => video.addEventListener(event, updateButton));
video.addEventListener('error', () => {
  root.classList.remove('video-ready');
  motionButton.hidden = true;
});

motionButton.addEventListener('click', async () => {
  if (!video.paused) { userPaused = true; video.pause(); return; }
  userPaused = false;
  if (video.ended || video.currentTime >= video.duration - .1) video.currentTime = 0;
  await startVideo();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) video.pause(); else startVideo();
});
new IntersectionObserver(([entry]) => {
  inView = entry.isIntersecting;
  if (!inView) video.pause(); else startVideo();
}, { threshold: .1 }).observe(video);

document.querySelectorAll('a[href="#experience"]').forEach(link => {
  link.addEventListener('click', event => {
    event.preventDefault();
    history.pushState(null, '', '#experience');
    experienceTitle.focus({ preventScroll: true });
    experience.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
  });
});

// Hide/pause the marketing scene whenever the findings workspace is active.
startVideo();
