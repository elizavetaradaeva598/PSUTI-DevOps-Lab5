const STATUS_LABELS = {
  published: "Опубликовано",
  draft: "Черновик",
  cancelled: "Отменено",
  archived: "Архив",
};

const ERROR_MESSAGES = {
  QUOTA_BELOW_SALES: "Нельзя установить квоту ниже уже проданных билетов.",
  QUOTA_EXCEEDS_CAPACITY: "Квота не может превышать вместимость площадки.",
  INVALID_QUOTA: "Квота должна быть целым положительным числом.",
  NOT_FOUND: "Мероприятие не найдено.",
  VALIDATION_ERROR: "Проверьте корректность введённого значения.",
  DATABASE_UNAVAILABLE: "База данных временно недоступна.",
};

const state = {
  events: [],
};

const el = {
  healthStatus: document.getElementById("healthStatus"),
  statEvents: document.getElementById("statEvents"),
  statQuota: document.getElementById("statQuota"),
  statSold: document.getElementById("statSold"),
  statAvailable: document.getElementById("statAvailable"),
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  sortFilter: document.getElementById("sortFilter"),
  refreshBtn: document.getElementById("refreshBtn"),
  globalBanner: document.getElementById("globalBanner"),
  eventsList: document.getElementById("eventsList"),
};

function showGlobalBanner(message, type = "error") {
  el.globalBanner.textContent = message;
  el.globalBanner.className = `banner banner--${type}`;
}

function hideGlobalBanner() {
  el.globalBanner.className = "banner hidden";
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

async function checkHealth() {
  try {
    const res = await fetch("/health/ready");
    if (res.ok) {
      el.healthStatus.textContent = "API и БД готовы";
    } else {
      el.healthStatus.textContent = "БД инициализируется...";
    }
  } catch {
    el.healthStatus.textContent = "Нет связи с сервером";
  }
}

async function loadEvents() {
  hideGlobalBanner();
  el.eventsList.innerHTML = `<div class="banner banner--info">Загрузка мероприятий...</div>`;

  const params = new URLSearchParams({
    include: "venue",
    page_size: "100",
    sort: el.sortFilter.value,
  });

  const query = el.searchInput.value.trim();
  if (query) params.set("q", query);

  const status = el.statusFilter.value;
  if (status) params.set("status", status);

  try {
    const response = await fetch(`/api/v1/events?${params.toString()}`);
    const payload = await response.json();

    if (!response.ok) {
      const code = payload?.error?.code;
      throw new Error(ERROR_MESSAGES[code] || payload?.error?.message || "Ошибка загрузки списка событий");
    }

    state.events = payload.data || [];
    renderSummary();
    renderEvents();
  } catch (err) {
    el.eventsList.innerHTML = "";
    showGlobalBanner(err.message || "Не удалось загрузить мероприятия.");
  }
}

function renderSummary() {
  const totalEvents = state.events.length;
  const totalQuota = state.events.reduce((sum, ev) => sum + ev.ticket_quota, 0);
  const totalSold = state.events.reduce((sum, ev) => sum + ev.sold_tickets, 0);
  const totalAvailable = state.events.reduce((sum, ev) => sum + ev.available_tickets, 0);

  el.statEvents.textContent = totalEvents;
  el.statQuota.textContent = totalQuota.toLocaleString("ru-RU");
  el.statSold.textContent = totalSold.toLocaleString("ru-RU");
  el.statAvailable.textContent = totalAvailable.toLocaleString("ru-RU");
}

function renderEvents() {
  if (state.events.length === 0) {
    el.eventsList.innerHTML = `<div class="banner banner--info">По заданным фильтрам мероприятий не найдено.</div>`;
    return;
  }

  el.eventsList.innerHTML = state.events
    .map((ev) => {
      const capacity = ev.venue ? ev.venue.capacity : "—";
      const venueName = ev.venue ? escapeHtml(ev.venue.name) : "Площадка не указана";
      const minAllowed = Math.max(1, ev.sold_tickets);
      const maxAttr = ev.venue ? `max="${ev.venue.capacity}"` : "";
      const occupancy = Math.min(100, Math.round(ev.occupancy_percent || 0));
      const freeClass = ev.available_tickets > 0 ? "metric__val--free" : "metric__val--zero";

      return `
        <article class="event-card" data-event-id="${ev.id}">
          <div class="event-card__header">
            <div>
              <h2 class="event-card__title">${escapeHtml(ev.title)}</h2>
              <div class="event-card__meta">
                ${venueName} · ${formatDate(ev.starts_at)} · ${ev.price_rub} ₽
              </div>
            </div>
            <span class="status-pill status-pill--${ev.status}">
              ${STATUS_LABELS[ev.status] || ev.status}
            </span>
          </div>

          <div class="metrics-box">
            <div>
              <span class="metric__label">Вместимость</span>
              <span class="metric__val">${capacity}</span>
            </div>
            <div>
              <span class="metric__label">Квота</span>
              <span class="metric__val">${ev.ticket_quota}</span>
            </div>
            <div>
              <span class="metric__label">Продано</span>
              <span class="metric__val">${ev.sold_tickets}</span>
            </div>
            <div>
              <span class="metric__label">Осталось</span>
              <span class="metric__val ${freeClass}">${ev.available_tickets}</span>
            </div>
          </div>

          <div class="progress-wrap">
            <div class="progress-labels">
              <span>Заполняемость квоты: ${occupancy}%</span>
              <span>Допустимая квота: ${minAllowed}–${capacity}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-bar__fill" style="width: ${occupancy}%"></div>
            </div>
          </div>

          <form class="quota-form" data-id="${ev.id}">
            <label for="quota-${ev.id}">Новая квота билетов</label>
            <div class="quota-form__row">
              <input
                type="number"
                id="quota-${ev.id}"
                name="ticket_quota"
                min="${minAllowed}"
                ${maxAttr}
                step="1"
                value="${ev.ticket_quota}"
                required
              />
              <button type="submit" class="btn btn--primary">Сохранить</button>
            </div>
            <div class="quota-presets">
              <button type="button" class="btn btn--mini" data-preset="${minAllowed}">
                Минимум по продажам (${minAllowed})
              </button>
              ${
                ev.venue
                  ? `<button type="button" class="btn btn--mini" data-preset="${ev.venue.capacity}">
                      Максимум площадки (${ev.venue.capacity})
                    </button>`
                  : ""
              }
            </div>
            <div class="card-feedback hidden" data-feedback></div>
          </form>
        </article>
      `;
    })
    .join("");
}

async function updateQuota(eventId, newQuota, formEl) {
  const feedbackEl = formEl.querySelector("[data-feedback]");
  const submitBtn = formEl.querySelector("button[type='submit']");

  feedbackEl.className = "card-feedback hidden";
  submitBtn.disabled = true;

  try {
    const response = await fetch(`/api/v1/events/${eventId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticket_quota: newQuota }),
    });

    const payload = await response.json();

    if (!response.ok) {
      const code = payload?.error?.code;
      const details = payload?.error?.details;
      let msg = ERROR_MESSAGES[code] || payload?.error?.message || "Ошибка обновления квоты.";
      if (code === "QUOTA_BELOW_SALES" && details?.sold_tickets !== undefined) {
        msg += ` Подтверждено продаж: ${details.sold_tickets}.`;
      }
      throw new Error(msg);
    }

    const idx = state.events.findIndex((item) => item.id === eventId);
    if (idx !== -1) {
      state.events[idx] = {
        ...state.events[idx],
        ...payload,
      };
    }

    renderSummary();
    renderEvents();

    const updatedCard = el.eventsList.querySelector(`[data-event-id="${eventId}"] [data-feedback]`);
    if (updatedCard) {
      updatedCard.textContent = `Квота обновлена: ${payload.ticket_quota} мест (остаток: ${payload.available_tickets}).`;
      updatedCard.className = "card-feedback card-feedback--ok";
    }
  } catch (err) {
    feedbackEl.textContent = err.message;
    feedbackEl.className = "card-feedback card-feedback--err";
  } finally {
    submitBtn.disabled = false;
  }
}

el.eventsList.addEventListener("click", (e) => {
  const presetBtn = e.target.closest("[data-preset]");
  if (!presetBtn) return;
  const form = presetBtn.closest(".quota-form");
  const input = form.querySelector("input[name='ticket_quota']");
  input.value = presetBtn.dataset.preset;
});

el.eventsList.addEventListener("submit", (e) => {
  const form = e.target.closest(".quota-form");
  if (!form) return;
  e.preventDefault();

  const eventId = form.dataset.id;
  const rawValue = form.querySelector("input[name='ticket_quota']").value;
  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed < 1) {
    const feedbackEl = form.querySelector("[data-feedback]");
    feedbackEl.textContent = "Введите целое число больше нуля.";
    feedbackEl.className = "card-feedback card-feedback--err";
    return;
  }

  updateQuota(eventId, parsed, form);
});

let searchTimer = null;
el.searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadEvents, 300);
});

el.statusFilter.addEventListener("change", loadEvents);
el.sortFilter.addEventListener("change", loadEvents);
el.refreshBtn.addEventListener("click", () => {
  checkHealth();
  loadEvents();
});

checkHealth();
loadEvents();
