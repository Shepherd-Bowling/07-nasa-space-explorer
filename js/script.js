// Keep all custom JavaScript here. dateRange.js supplies the date limits.
const startInput = document.getElementById('startDate');
const endInput = document.getElementById('endDate');
setupDateInputs(startInput, endInput);
// The starter uses UTC; use the visitor's local day to avoid requesting tomorrow.
const localNow = new Date();
const localToday = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
startInput.max = localToday;
endInput.max = localToday;
if (endInput.value > localToday) endInput.value = localToday;
startInput.addEventListener('change', () => {
  if (endInput.value > localToday) endInput.value = localToday;
});

// NASA’s current public APOD endpoint does not require an API key.
const form = document.getElementById('dateForm');
const gallery = document.getElementById('gallery');
const statusMessage = document.getElementById('status');
const searchButton = document.getElementById('searchButton');
const resultCount = document.getElementById('resultCount');
const modal = document.getElementById('photoModal');
const modalMedia = document.getElementById('modalMedia');
statusMessage.textContent = 'Choose a date range to explore NASA’s archive.';

const facts = [
  'Sunlight takes about eight minutes to travel from the Sun to Earth.',
  'Venus takes longer to rotate once than it takes to orbit the Sun.',
  'Jupiter’s Great Red Spot is a giant storm larger than Earth.',
  'The Moon is slowly moving away from Earth, by about 3.8 centimeters each year.',
  'The Sun contains more than 99 percent of the mass in our solar system.',
  'Neutron stars can pack more mass than the Sun into a sphere about the size of a city.'
];
document.getElementById('spaceFact').textContent = facts[Math.floor(Math.random() * facts.length)];

// Use local midnight so dates do not shift to the previous day in some time zones.
function formatDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  });
}

// Only allow web URLs in image sources and outgoing links.
function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function makeImage(url, title) {
  const image = document.createElement('img');
  image.src = url;
  image.alt = title;
  image.addEventListener('error', () => {
    const fallback = document.createElement('span');
    fallback.className = 'media-fallback';
    fallback.textContent = 'Preview unavailable';
    image.replaceWith(fallback);
  });
  return image;
}

// NASA's current API uses url for the ARTICLE and hdurl for the IMAGE.
// Parse HTML in an inert document and display only its text, never execute it.
function normalizeEntry(entry) {
  const parser = new DOMParser();
  const basic = parser.parseFromString(entry.basic_html || '', 'text/html');
  const plainText = (value) => parser.parseFromString(value || '', 'text/html').body.textContent.trim();
  const isVideo = ['video', 'iframe'].includes(entry.media_type);
  const embedded = basic.querySelector('iframe[src], video[src], video source[src]');
  const image = safeUrl(entry.hdurl) || safeUrl(basic.querySelector('img')?.getAttribute('src'));
  return {
    ...entry,
    title: plainText(entry.title),
    explanation: plainText(entry.explanation),
    copyright: plainText(entry.copyright || entry.credit),
    media_type: isVideo ? 'video' : 'image',
    url: isVideo ? safeUrl(embedded?.getAttribute('src')) || safeUrl(entry.permalink || entry.url) : image,
    hdurl: isVideo ? '' : image,
    thumbnail_url: isVideo ? image : ''
  };
}

async function fetchEntries(start, end, signal) {
  const items = [];
  // New NASA date filters use YYMMDD. Each page contains at most 25 entries.
  for (let page = 1; ; page++) {
    const url = new URL('https://science.nasa.gov/wp-json/wp/v2/apod-basic');
    url.search = new URLSearchParams({
      date_from: start.replaceAll('-', '').slice(2),
      date_to: end.replaceAll('-', '').slice(2),
      per_page: '25', page: String(page)
    });
    const response = await fetch(url, { signal });
    if (!response.ok) {
      if (response.status === 429) throw new Error('NASA’s request limit was reached. Please try again later.');
      throw new Error('NASA could not load that date range. Please try again or choose a shorter range.');
    }
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error('NASA returned an unexpected response. Please try again.');
    items.push(...batch.filter(item => item.date >= start && item.date <= end).map(normalizeEntry));
    const totalPages = Number(response.headers.get('X-WP-TotalPages'));
    if (batch.length < 25 || (totalPages > 0 && page >= totalPages)) break;
  }
  return items;
}

function openDetails(item) {
  modalMedia.replaceChildren();
  const imageUrl = safeUrl(item.hdurl) || safeUrl(item.url);
  if (item.media_type === 'image' && imageUrl) {
    modalMedia.append(makeImage(imageUrl, item.title));
  } else {
    const videoUrl = safeUrl(item.url);
    if (videoUrl) {
      const link = document.createElement('a');
      link.href = videoUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Watch this APOD video ↗ (opens in a new tab)';
      modalMedia.append(link);
    }
  }
  document.getElementById('modalTitle').textContent = item.title;
  document.getElementById('modalDate').textContent = formatDate(item.date);
  document.getElementById('modalExplanation').textContent = item.explanation || 'No explanation is available.';
  document.getElementById('modalCredit').textContent = item.copyright ? `Image credit: ${item.copyright}` : 'Source: NASA Astronomy Picture of the Day';
  modal.showModal();
}

document.getElementById('closeModal').addEventListener('click', () => modal.close());
// Native dialog also supports Escape, focus trapping, and returning focus to the card.
modal.addEventListener('click', (event) => {
  if (event.target !== modal) return;
  const bounds = modal.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) modal.close();
});

modal.addEventListener('close', () => modalMedia.replaceChildren());

function displayGallery(items) {
  gallery.replaceChildren();
  items.sort((a, b) => a.date.localeCompare(b.date));
  for (const item of items) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'gallery-item';
    card.setAttribute('aria-label', `View ${item.title}, ${formatDate(item.date)}`);
    const media = document.createElement('span');
    media.className = 'image-wrap';
    const preview = safeUrl(item.media_type === 'image' ? item.url : item.thumbnail_url);
    if (preview) {
      const image = makeImage(preview, item.title);
      image.loading = 'lazy';
      media.append(image);
    } else {
      const fallback = document.createElement('span');
      fallback.className = 'media-fallback';
      fallback.textContent = item.media_type === 'video' ? '▶ Watch video' : 'View details';
      media.append(fallback);
    }
    if (item.media_type === 'video') {
      const badge = document.createElement('span');
      badge.className = 'media-label';
      badge.textContent = '▶ VIDEO';
      media.append(badge);
    }
    const copy = document.createElement('span');
    copy.className = 'card-copy';
    const title = document.createElement('h3');
    title.textContent = item.title;
    const date = document.createElement('time');
    date.dateTime = item.date;
    date.textContent = formatDate(item.date);
    copy.append(title, date);
    card.append(media, copy);
    card.addEventListener('click', () => openDetails(item));
    gallery.append(card);
  }
  resultCount.textContent = `${items.length} ${items.length === 1 ? 'discovery' : 'discoveries'}`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  if (startInput.value > endInput.value) {
    statusMessage.textContent = 'Please choose an end date on or after the start date.';
    endInput.focus();
    return;
  }
  gallery.replaceChildren();
  resultCount.textContent = '';
  statusMessage.textContent = 'Loading space photos…';
  gallery.setAttribute('aria-busy', 'true');
  searchButton.disabled = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const items = await fetchEntries(startInput.value, endInput.value, controller.signal);
    displayGallery(items);
    statusMessage.textContent = items.length ? 'Select any discovery to read its story.' : 'No entries were found. Try another date range.';
  } catch (error) {
    statusMessage.textContent = error.name === 'AbortError'
      ? 'NASA took too long to respond. Please try a smaller date range.'
      : error instanceof TypeError ? 'Unable to connect to NASA. Check your internet connection and try again.' : error.message;
  } finally {
    clearTimeout(timeout);
    gallery.setAttribute('aria-busy', 'false');
    searchButton.disabled = false;
  }
});

// Load the default date range immediately, then allow further searches with the form.
form.requestSubmit();
