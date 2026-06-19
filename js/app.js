// ============================================================
// LÓGICA DA TELA DO ALUNO
// ============================================================

(async () => {
  // Aguarda Firebase inicializar
  await new Promise(r => setTimeout(r, 300));
  const { db } = window.firebaseApp;

  // ---- ESTADO DA APLICAÇÃO ----
  let selectedStateId = null;
  let selectedCampusId = null;
  let currentDate = new Date();
  let currentWeekOffset = 0; // 0 = semana atual
  const today = new Date();

  // ---- REFERÊNCIAS DOM ----
  const stateSelect = document.getElementById('state-select');
  const campusSelect = document.getElementById('campus-select');
  const mainContent = document.getElementById('main-content');
  const weekTitleEl = document.getElementById('week-title');
  const daysStripEl = document.getElementById('days-strip');
  const menuSectionEl = document.getElementById('menu-section');
  const menuDateLabelEl = document.getElementById('menu-date-label');
  const mealsGridEl = document.getElementById('meals-grid');
  const weekNavEl = document.getElementById('week-nav');

  // ---- DEFINIÇÕES DAS REFEIÇÕES ----
  const MEALS = [
    {
      key: 'morning_break',
      icon: '🥐',
      label: 'Intervalo da Manhã',
      type: 'Lanche',
      time: '09:30 – 10:00'
    },
    {
      key: 'lunch',
      icon: '🍽️',
      label: 'Almoço',
      type: 'Refeição Principal',
      time: '12:00 – 13:00'
    },
    {
      key: 'afternoon_break',
      icon: '🍎',
      label: 'Intervalo da Tarde',
      type: 'Lanche',
      time: '15:30 – 16:00'
    },
    {
      key: 'dinner',
      icon: '🌙',
      label: 'Janta',
      type: 'Refeição Principal',
      time: '18:30 – 19:30'
    },
    {
      key: 'evening_break',
      icon: '⭐',
      label: 'Intervalo Noturno',
      type: 'Lanche',
      time: '21:00 – 21:30'
    }
  ];

  // ---- NOMES DOS DIAS ----
  const DAY_NAMES = {
    pt: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
    full: ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
  };

  const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const MONTH_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  // ============================================================
  // INICIALIZAÇÃO — Campus fixo: IFRO Campus Ariquemes
  // ============================================================
  async function init() {
    await DataService.seedInitialData();
    selectedCampusId = 'ariquemes';
    currentWeekOffset = 0;
    currentDate = new Date();
    mainContent.innerHTML = '';
    renderWeekNav();
    loadMenuForDate(currentDate);
  }

  // ============================================================
  // NAVEGAÇÃO DE SEMANA
  // ============================================================
  function getWeekStart(date, offset = 0) {
    const d = new Date(date);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1 + offset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function renderWeekNav() {
    weekNavEl.style.display = 'block';
    const weekStart = getWeekStart(today, currentWeekOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 4);

    const startStr = `${weekStart.getDate()} ${MONTH_NAMES[weekStart.getMonth()]}`;
    const endStr = `${weekEnd.getDate()} ${MONTH_NAMES[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
    weekTitleEl.textContent = `${startStr} – ${endStr}`;

    daysStripEl.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const btn = document.createElement('button');
      btn.className = 'day-btn';
      if (isSameDay(d, today)) btn.classList.add('today');
      if (isSameDay(d, currentDate)) btn.classList.add('active');

      btn.innerHTML = `
        <span class="day-name">${DAY_NAMES.pt[d.getDay()]}</span>
        <span class="day-num">${d.getDate()}</span>
      `;

      btn.addEventListener('click', () => {
        currentDate = d;
        renderWeekNav();
        loadMenuForDate(d);
      });

      daysStripEl.appendChild(btn);
    }
  }

  document.getElementById('btn-prev-week').addEventListener('click', () => {
    const prev = new Date(currentDate);
    prev.setDate(prev.getDate() - 1);
    currentDate = prev;
    // Recalcula o offset da semana se mudou de semana
    const currentWeekStart = getWeekStart(today, currentWeekOffset);
    if (prev < currentWeekStart) currentWeekOffset--;
    renderWeekNav();
    loadMenuForDate(currentDate);
  });

  document.getElementById('btn-next-week').addEventListener('click', () => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + 1);
    currentDate = next;
    // Recalcula o offset da semana se mudou de semana
    const currentWeekEnd = new Date(getWeekStart(today, currentWeekOffset));
    currentWeekEnd.setDate(currentWeekEnd.getDate() + 4);
    if (next > currentWeekEnd) currentWeekOffset++;
    renderWeekNav();
    loadMenuForDate(currentDate);
  });

  // ============================================================
  // CARREGAR CARDÁPIO
  // ============================================================
  async function loadMenuForDate(date) {
    menuSectionEl.style.display = 'block';
    const dayName = DAY_NAMES.full[date.getDay()];
    const dateStr = formatDate(date);
    menuDateLabelEl.innerHTML = `<span>${dayName}</span>, ${date.getDate()} de ${MONTH_FULL[date.getMonth()]} de ${date.getFullYear()}`;

    // Skeleton
    mealsGridEl.innerHTML = MEALS.map(() => `
      <div class="skeleton-card">
        <div class="skeleton skeleton-line" style="width:60%;height:16px;margin-bottom:12px"></div>
        <div class="skeleton skeleton-line" style="width:40%;height:12px;margin-bottom:16px"></div>
        <div class="skeleton skeleton-line" style="width:100%;height:12px;margin-bottom:8px"></div>
        <div class="skeleton skeleton-line" style="width:80%;height:12px"></div>
      </div>
    `).join('');

    try {
      const menuData = await DataService.getDayMenuPublic(selectedCampusId, dateStr);
      renderMeals(menuData);
    } catch (e) {
      console.error(e);
      renderMeals(null);
      showToast('Erro ao carregar cardápio. Tente novamente.', 'error');
    }
  }

  /**
   * Renderiza apenas as refeições com conteúdo cadastrado.
   * Cards vazios ou com texto genérico de "não cadastrado" são
   * completamente omitidos do DOM (Heurística Nielsen #8 — Estética e
   * Design Minimalista: não exibir informação irrelevante).
   */
  function renderMeals(data) {
    // ── Sem dados para o dia ──────────────────────────────────
    if (!data) {
      mealsGridEl.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">🥗</div>
          <h2>Cardápio não disponível</h2>
          <p>O cardápio para este dia ainda não foi cadastrado pela nutricionista.</p>
        </div>
      `;
      return;
    }

    // ── Filtra apenas refeições com conteúdo real ─────────────
    const EMPTY_PATTERNS = /^(não cadastrado|nao cadastrado|—|-)(\s.*)?$/i;

    const mealsWithContent = MEALS.filter(meal => {
      const content = data[meal.key];
      if (!content) return false;
      const trimmed = String(content).trim();
      if (!trimmed) return false;
      if (EMPTY_PATTERNS.test(trimmed)) return false;
      return true;
    });

    // ── Nenhuma refeição com conteúdo → empty-state ───────────
    if (!mealsWithContent.length) {
      mealsGridEl.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">🥗</div>
          <h2>Cardápio não disponível</h2>
          <p>Nenhuma refeição foi cadastrada para este dia.</p>
        </div>
      `;
      return;
    }

    // ── Renderiza apenas os cards com conteúdo ────────────────
    mealsGridEl.innerHTML = mealsWithContent.map(meal => {
      const content = String(data[meal.key]).trim();
      return `
        <div class="meal-card" data-meal="${meal.key}">
          <div class="meal-card-header">
            <div class="meal-icon-wrap">${meal.icon}</div>
            <div class="meal-info">
              <div class="meal-type">${meal.type}</div>
              <div class="meal-name">${meal.label}</div>
              <div class="meal-time">🕐 ${meal.time}</div>
            </div>
          </div>
          <div class="meal-card-body">
            <p class="meal-content">${escapeHtml(content)}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  // ============================================================
  // TELA INICIAL (SEM CAMPUS)
  // ============================================================
  function renderSelectPrompt() {
    weekNavEl.style.display = 'none';
    menuSectionEl.style.display = 'none';
    mainContent.innerHTML = `
      <div class="select-prompt">
        <div class="prompt-icon">🍽️</div>
        <h2>Bem-vindo ao Cardápio!</h2>
        <p>Selecione seu <strong>Estado</strong> e <strong>Campus</strong> acima para visualizar o cardápio do dia.</p>
      </div>
    `;
  }

  // ============================================================
  // UTILITÁRIOS
  // ============================================================
  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }

  function formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  }

  function showToast(msg, type = '') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `${type === 'error' ? '❌' : '✅'} ${msg}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // ---- INICIAR ----
  init().catch(console.error);

})();
