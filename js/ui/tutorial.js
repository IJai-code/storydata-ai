// "How to Embed in Slides" — tabbed, glassmorphic instruction panel for
// dropping Ellery MP4 loop exports into PowerPoint, Google Slides, Keynote.

const TABS = [
  {
    id: 'powerpoint',
    label: 'PowerPoint',
    sub: 'Win / Mac',
    steps: [
      "Click 'Insert' › 'Video' › 'Video on My PC'.",
      'Select the downloaded Ellery MP4 file.',
      "Under 'Video Tools Playback' at the top, check 'Loop until Stopped' and change 'Start' to 'Automatically'.",
    ],
  },
  {
    id: 'gslides',
    label: 'Google Slides',
    sub: 'Chromebook / Web',
    steps: [
      'First, download the Ellery MP4 to your computer (it lands in your Downloads folder).',
      "Open Google Drive (drive.google.com), click 'New' › 'File upload', and choose the downloaded MP4. Wait for the upload to finish.",
      "In Google Slides, open your slide and click 'Insert' › 'Video', then switch to the 'Google Drive' tab.",
      'Select the MP4 you just uploaded and click Insert (do not paste a link — it must be the uploaded Drive file).',
      "Select the video, open the 'Format options' sidebar, and under 'Video playback' choose 'Play (automatically)' and check 'Loop video'.",
    ],
  },
  {
    id: 'keynote',
    label: 'Keynote',
    sub: 'Mac / iPad',
    steps: [
      'Drag and drop the downloaded Ellery MP4 file directly onto your slide.',
      "Navigate to the 'Format' design sidebar on the right and click the 'Movie' tab.",
      "Change the 'Repeat' configuration dropdown from 'None' to 'Loop'.",
    ],
  },
];

let rootEl = null;

export function initTutorial(root, trigger) {
  rootEl = root;
  trigger.addEventListener('click', () => open(TABS[0].id));
}

function open(activeId) {
  rootEl.innerHTML = `
    <div class="modal-overlay" id="tutorialOverlay">
      <div class="modal tutorial-modal" role="dialog" aria-modal="true" aria-labelledby="tutorialTitle">
        <button class="modal-close" id="tutorialClose" aria-label="Close">✕</button>
        <div class="tutorial-body">
          <div class="paywall-kicker">Loopable slide assets</div>
          <h2 id="tutorialTitle">How to embed your Ellery loop in slides.</h2>
          <p class="tutorial-sub">Export a Dynamic MP4, then drop it into your deck —
          three platforms, three quiet steps each.</p>
          <div class="tutorial-tabs" role="tablist">
            ${TABS.map(
              (t) => `
              <button class="tutorial-tab${t.id === activeId ? ' active' : ''}"
                      role="tab" aria-selected="${t.id === activeId}" data-tab="${t.id}">
                ${t.label}<span>${t.sub}</span>
              </button>`
            ).join('')}
          </div>
          ${TABS.map(
            (t) => `
            <ol class="tutorial-steps${t.id === activeId ? ' active' : ''}" data-panel="${t.id}">
              ${t.steps.map((s) => `<li>${s}</li>`).join('')}
            </ol>`
          ).join('')}
        </div>
      </div>
    </div>`;

  const overlay = document.getElementById('tutorialOverlay');
  const close = () => {
    rootEl.innerHTML = '';
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  document.getElementById('tutorialClose').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelectorAll('[data-tab]').forEach((btn) =>
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('[data-tab]').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
      });
      overlay.querySelectorAll('[data-panel]').forEach((p) => {
        p.classList.toggle('active', p.dataset.panel === btn.dataset.tab);
      });
    })
  );
}
