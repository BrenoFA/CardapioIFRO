// ============================================================
// LÓGICA DO PAINEL ADMINISTRATIVO
// Arquitetura: IIFE assíncrono com controle de acesso por role
// ============================================================

(async () => {
  await new Promise(r => setTimeout(r, 300));
  const { auth, db } = window.firebaseApp;

  // ─── ESTADO DA APLICAÇÃO ──────────────────────────────────────
  let currentUser   = null;   // firebase.User
  let userProfile   = null;   // { uid, email, name, role }
  let activeView    = 'dashboard';
  let menuCampusId  = null;
  let menuYear      = null;
  let menuWeek      = null;
  let menuData      = {};

  // ─── TIMEOUT DE SESSÃO ─────────────────────────────────────────
  // Desloga a nutricionista automaticamente após INACTIVITY_LIMIT ms de inatividade.
  const INACTIVITY_LIMIT_MS = 15 * 60 * 1000; // 15 minutos
  let _lastActivity = Date.now();
  let _timeoutInterval = null;

  function _resetActivityTimer() {
    _lastActivity = Date.now();
  }

  function _startSessionTimeout() {
    _resetActivityTimer();
    // Escuta eventos de atividade do usuário
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
      document.addEventListener(evt, _resetActivityTimer, { passive: true });
    });
    // Verifica inatividade a cada 30 segundos
    _timeoutInterval = setInterval(async () => {
      const idleMs = Date.now() - _lastActivity;
      // Aviso 2 minutos antes do logout
      if (idleMs >= INACTIVITY_LIMIT_MS - 2 * 60 * 1000 && idleMs < INACTIVITY_LIMIT_MS) {
        showToast('⚠️ Sessão expirando em 2 minutos por inatividade.', 'warning');
      }
      if (idleMs >= INACTIVITY_LIMIT_MS) {
        _stopSessionTimeout();
        showToast('Sessão encerrada por inatividade. Faça login novamente.', 'info');
        await auth.signOut();
      }
    }, 30_000);
  }

  function _stopSessionTimeout() {
    if (_timeoutInterval) { clearInterval(_timeoutInterval); _timeoutInterval = null; }
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
      document.removeEventListener(evt, _resetActivityTimer);
    });
  }

  const DAY_KEYS   = ['monday','tuesday','wednesday','thursday','friday'];
  const DAY_LABELS = ['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira'];
  const MEAL_KEYS  = ['morning_break','lunch','afternoon_break','dinner','evening_break'];
  const MEAL_LABELS= ['Intervalo da Manhã','Almoço','Intervalo da Tarde','Janta','Intervalo Noturno'];
  const MEAL_ICONS = ['🥐','🍽️','🍎','🌙','⭐'];

  // ─── HELPERS DE ACESSO ───────────────────────────────────────
  const isNutritionist = () => {
    if (userProfile?.role === 'nutritionist') return true;
    if (currentUser && currentUser.email) {
      const email = currentUser.email.toLowerCase();
      return email.includes('nutri') || email.includes('nutritionist') || email.includes('nutrition');
    }
    return false;
  };

  // ─── AUTH ────────────────────────────────────────────────────
  auth.onAuthStateChanged(async user => {
    if (user) {
      currentUser = user;
      // Busca perfil completo (role) antes de renderizar o painel
      userProfile = await DataService.getUserProfile(user.uid);

      // Verifica consentimento LGPD antes de exibir o painel
      const hasConsent = userProfile?.lgpdConsent === true;
      if (!hasConsent) {
        await _showLgpdConsentModal(user.uid);
        // _showLgpdConsentModal resolve apenas após aceite, então aqui já aceitou
      }

      showPanel(user);
      _startSessionTimeout();
    } else {
      currentUser = null;
      userProfile = null;
      _stopSessionTimeout();
      showLogin();
    }
  });

  // ─── LGPD: Modal de Consentimento ─────────────────────────────
  /**
   * Exibe o modal LGPD e resolve a Promise somente quando o usuário aceitar.
   * O modal não pode ser fechado sem aceite.
   */
  function _showLgpdConsentModal(uid) {
    return new Promise(resolve => {
      const overlay  = document.getElementById('modal-lgpd-consent');
      const checkbox = document.getElementById('lgpd-checkbox');
      const acceptBtn= document.getElementById('btn-lgpd-accept');
      if (!overlay) { resolve(); return; }

      // Mostra o modal (sem usar closeModal para impedir fechamento via Escape)
      overlay.style.display = 'flex';
      overlay.classList.add('open');

      // Habilita o botão apenas quando o checkbox estiver marcado
      checkbox.checked = false;
      acceptBtn.disabled = true;
      acceptBtn.setAttribute('aria-disabled', 'true');

      const onCheck = () => {
        acceptBtn.disabled = !checkbox.checked;
        acceptBtn.setAttribute('aria-disabled', String(!checkbox.checked));
      };
      checkbox.addEventListener('change', onCheck);

      // Ao aceitar: grava no Firestore e fecha o modal
      const onAccept = async () => {
        acceptBtn.removeEventListener('click', onAccept);
        checkbox.removeEventListener('change', onCheck);
        acceptBtn.innerHTML = `<svg class="spin-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-18 0"/></svg> Salvando...`;
        acceptBtn.disabled = true;
        try {
          await db.collection('users').doc(uid).set({
            lgpdConsent: true,
            lgpdConsentDate: new Date().toISOString(),
            lgpdConsentVersion: '1.0',
          }, { merge: true });
        } catch(e) {
          console.warn('Não foi possível registrar consentimento no Firestore:', e);
        }
        overlay.style.display = 'none';
        overlay.classList.remove('open');
        resolve();
      };
      acceptBtn.addEventListener('click', onAccept);

      // Bloqueia fechamento via Escape enquanto modal LGPD estiver aberto
      const blockEscape = (e) => {
        if (e.key === 'Escape') e.stopImmediatePropagation();
      };
      overlay.addEventListener('keydown', blockEscape);
    });
  }

  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const pass     = document.getElementById('login-password').value;
    const btn      = document.getElementById('btn-login');
    const errorEl  = document.getElementById('login-error');

    btn.textContent = 'Entrando...';
    btn.disabled    = true;
    errorEl.style.display = 'none';

    try {
      await auth.signInWithEmailAndPassword(email, pass);
    } catch (err) {
      errorEl.textContent    = translateAuthError(err.code);
      errorEl.style.display  = 'block';
    } finally {
      btn.textContent = 'Entrar';
      btn.disabled    = false;
    }
  });

  // ── ESQUECI MINHA SENHA ──────────────────────────────────────────
  // Alternância entre tela de login e tela de recuperação
  document.getElementById('btn-show-reset').addEventListener('click', () => {
    document.getElementById('login-form-section').style.display  = 'none';
    document.getElementById('reset-form-section').style.display  = 'block';
    document.getElementById('reset-error').style.display         = 'none';
    document.getElementById('reset-success').style.display       = 'none';
    document.getElementById('reset-form').reset();
    setTimeout(() => document.getElementById('reset-email').focus(), 100);
  });

  document.getElementById('btn-back-login').addEventListener('click', () => {
    document.getElementById('reset-form-section').style.display  = 'none';
    document.getElementById('login-form-section').style.display  = 'block';
    document.getElementById('login-error').style.display         = 'none';
    document.getElementById('login-form').reset();
    setTimeout(() => document.getElementById('login-email').focus(), 100);
  });

  document.getElementById('reset-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('reset-email').value.trim();
    const btn      = document.getElementById('btn-reset-submit');
    const errorEl  = document.getElementById('reset-error');
    const successEl= document.getElementById('reset-success');

    errorEl.style.display   = 'none';
    successEl.style.display = 'none';
    btn.textContent  = 'Enviando...';
    btn.disabled     = true;

    try {
      await auth.sendPasswordResetEmail(email);
      // Sempre exibe mensagem de sucesso genérica (evita enumeração de usuários)
      successEl.textContent   = '✅ Se o email estiver cadastrado, você receberá as instruções em breve. Verifique sua caixa de entrada e spam.';
      successEl.style.display = 'block';
      document.getElementById('reset-form').reset();
    } catch (err) {
      errorEl.textContent   = translateResetError(err.code);
      errorEl.style.display = 'block';
    } finally {
      btn.textContent = 'Enviar link de recuperação';
      btn.disabled    = false;
    }
  });

  function translateResetError(code) {
    const msgs = {
      'auth/invalid-email':      'Email inválido. Verifique o endereço informado.',
      'auth/user-not-found':     'Não encontramos esse email. Verifique se está correto.',
      'auth/too-many-requests':  'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      'auth/network-request-failed': 'Erro de conexão. Verifique sua internet.',
    };
    return msgs[code] || 'Erro ao enviar o email. Tente novamente.';
  }


  document.getElementById('btn-logout').addEventListener('click', async () => {
    await auth.signOut();
  });

  function translateAuthError(code) {
    const msgs = {
      'auth/user-not-found':    'Usuário não encontrado.',
      'auth/wrong-password':    'Senha incorreta.',
      'auth/invalid-email':     'Email inválido.',
      'auth/too-many-requests': 'Muitas tentativas. Aguarde um momento.',
      'auth/invalid-credential':'Email ou senha incorretos.',
    };
    return msgs[code] || 'Erro ao fazer login. Tente novamente.';
  }

  function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('admin-panel').style.display  = 'none';

    // Oculta o chatbot na tela de login
    _applyChatbotVisibility(false);
  }

  function showPanel(user) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-panel').style.display  = 'flex';

    const name = user.displayName || user.email.split('@')[0];
    document.getElementById('user-name').textContent       = name;
    document.getElementById('user-avatar-text').textContent = name.charAt(0).toUpperCase();

    // Exibe badge do cargo
    const roleEl = document.getElementById('user-role');
    if (roleEl && userProfile?.role) {
      roleEl.textContent = userProfile.role === 'nutritionist' ? 'Nutricionista' : userProfile.role;
    }

    // Renderização condicional: mostra CTA de cardápio apenas para nutricionistas
    _applyRoleUI();

    loadDashboard();
    navigateTo('dashboard');

    // Exibe o chatbot se for nutricionista (com retry caso o widget ainda não esteja pronto)
    _applyChatbotVisibility(isNutritionist(), user.uid);
  }

  // Controla a visibilidade do chatbot com retry para resolver timing de carregamento
  function _applyChatbotVisibility(visible, uid = null) {
    if (window.geminiChatWidget) {
      if (uid) window.geminiChatWidget.setUserStorageKey(uid);
      visible ? window.geminiChatWidget.show() : window.geminiChatWidget.hide();
    } else {
      // chat-bot.js ainda não terminou de inicializar — tenta novamente em 500ms
      setTimeout(() => {
        if (window.geminiChatWidget) {
          if (uid) window.geminiChatWidget.setUserStorageKey(uid);
          visible ? window.geminiChatWidget.show() : window.geminiChatWidget.hide();
        }
      }, 500);
    }
  }

  /**
   * Aplica renderização condicional baseada no cargo (role).
   * Nutricionista: vê o hero CTA de cardápio e o item de nav destacado.
   * Outros cargos: o item de cardápio é desabilitado/oculto.
   */
  function _applyRoleUI() {
    const nutriOnly = document.querySelectorAll('[data-role="nutritionist"]');
    nutriOnly.forEach(el => {
      el.style.display = isNutritionist() ? '' : 'none';
    });

    // Desabilita o item de Cardápios no nav se não for nutricionista
    const menuNavItem = document.querySelector('.nav-item[data-view="menus"]');
    if (menuNavItem) {
      if (!isNutritionist()) {
        menuNavItem.classList.add('nav-item--disabled');
        menuNavItem.setAttribute('aria-disabled', 'true');
        menuNavItem.title = 'Acesso restrito a Nutricionistas';
      } else {
        menuNavItem.classList.remove('nav-item--disabled');
        menuNavItem.removeAttribute('aria-disabled');
      }
    }
  }

  // ─── NAVEGAÇÃO ───────────────────────────────────────────────
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', () => {
      // Bloqueia navegação para cardápios se não for nutricionista
      if (item.dataset.view === 'menus' && !isNutritionist()) {
        showToast('Acesso restrito. Apenas Nutricionistas podem gerenciar cardápios.', 'warning');
        return;
      }
      navigateTo(item.dataset.view);
      document.querySelector('.sidebar').classList.remove('open');
    });
  });

  function navigateTo(view) {
    activeView = view;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.admin-view').forEach(v => v.classList.remove('active'));

    const navItem = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (navItem) navItem.classList.add('active');
    const viewEl  = document.getElementById(`view-${view}`);
    if (viewEl) viewEl.classList.add('active');

    const titles = {
      dashboard: 'Dashboard',
      menus:     'Cardápios',
      campuses:  'Campi',
      states:    'Estados',
      users:     'Usuários'
    };
    document.getElementById('topbar-title').textContent = titles[view] || 'Admin';

    if (view === 'states')    loadStatesView();
    if (view === 'campuses')  loadCampusesView();
    if (view === 'menus')     loadMenusView();
    if (view === 'dashboard') loadDashboard();
    if (view === 'users')     loadUsersView();
  }

  // Mobile menu toggle
  document.getElementById('mobile-menu-btn').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('open');
  });

  // ─── DASHBOARD ───────────────────────────────────────────────
  async function loadDashboard() {
    try {
      const [states, campiSnap] = await Promise.all([
        DataService.getStates(),
        db.collection('campi').get(),
      ]);
      document.getElementById('stat-states').textContent = states.length;
      document.getElementById('stat-campi').textContent  = campiSnap.size;

      // Contagem de dias com cardápio nesta semana (soma em todos os campi)
      const today = new Date();
      const { year, week } = DataService.getISOWeekInfo(today);
      const weekSnap = await db.collection('menus')
        .where('year', '==', year)
        .where('week', '==', week)
        .get();

      const DAY_KEYS_DASH = ['monday','tuesday','wednesday','thursday','friday'];
      let daysWithMenu = 0;
      weekSnap.docs
        .filter(d => !d.id.startsWith('specific_'))
        .forEach(d => {
          const data = d.data();
          DAY_KEYS_DASH.forEach(dk => {
            const day = data[dk];
            if (day && Object.values(day).some(v => String(v || '').trim())) {
              daysWithMenu++;
            }
          });
        });
      document.getElementById('stat-menus').textContent = daysWithMenu;

    } catch (e) {
      console.error('Dashboard load error:', e);
    }
  }


  // ─── ESTADOS ─────────────────────────────────────────────────
  async function loadStatesView() {
    const tbody = document.getElementById('states-table-body');
    tbody.innerHTML = '<tr><td colspan="3"><div class="spinner"></div></td></tr>';
    const states = await DataService.getStates();
    if (!states.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--color-text-muted)">Nenhum estado cadastrado</td></tr>';
      return;
    }
    tbody.innerHTML = states.map(s => `
      <tr>
        <td>${_escHtml(s.name)}</td>
        <td><span class="badge badge-green">${_escHtml(s.abbr)}</span></td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="deleteState('${s.id}','${_escHtml(s.name)}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            Excluir
          </button>
        </td>
      </tr>
    `).join('');
  }

  document.getElementById('btn-add-state').addEventListener('click', () => {
    openModal('modal-state');
  });

  document.getElementById('form-state').addEventListener('submit', async e => {
    e.preventDefault();
    const name   = document.getElementById('state-name').value.trim();
    const abbr   = document.getElementById('state-abbr').value.trim().toUpperCase();
    const btn    = e.target.querySelector('button[type=submit]');
    const setLoading = v => { btn.disabled = v; btn.textContent = v ? 'Salvando...' : 'Adicionar'; };

    if (!name || !abbr) return;
    setLoading(true);
    try {
      await DataService.addState(name, abbr);
      closeModal('modal-state');
      document.getElementById('form-state').reset();
      await Promise.all([loadStatesView(), loadDashboard()]);
      showToast('Estado adicionado com sucesso!', 'success');
    } catch (e) {
      showToast(e.message?.replace('DUPLICATE: ','').replace('VALIDATION: ','') || 'Erro ao adicionar estado.', 'error');
    } finally {
      setLoading(false);
    }
  });

  window.deleteState = async (id, name) => {
    if (!confirm(`Excluir o estado "${name}"? Todos os campi associados serão perdidos.`)) return;
    try {
      await DataService.deleteState(id);
      await Promise.all([loadStatesView(), loadDashboard()]);
      showToast('Estado excluído.', 'success');
    } catch {
      showToast('Erro ao excluir estado.', 'error');
    }
  };

  // ─── CAMPI ───────────────────────────────────────────────────
  async function loadCampusesView() {
    const tbody = document.getElementById('campuses-table-body');
    tbody.innerHTML = '<tr><td colspan="3"><div class="spinner"></div></td></tr>';

    // Otimizado: usa getAllCampiWithState() que faz fetch paralelo
    const allCampi = await DataService.getAllCampiWithState();

    if (!allCampi.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--color-text-muted)">Nenhum campus cadastrado</td></tr>';
    } else {
      tbody.innerHTML = allCampi.map(c => `
        <tr>
          <td>${_escHtml(c.name)}</td>
          <td>${_escHtml(c.stateName)}</td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="deleteCampus('${c.id}','${_escHtml(c.name)}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              Excluir
            </button>
          </td>
        </tr>
      `).join('');
    }

    // Popula select do modal com dados frescos
    const states = await DataService.getStates();
    const stateSelect = document.getElementById('campus-state-select');
    stateSelect.innerHTML = '<option value="">Selecione o Estado</option>' +
      states.map(s => `<option value="${s.id}">${_escHtml(s.name)}</option>`).join('');
  }

  document.getElementById('btn-add-campus').addEventListener('click', async () => {
    // Re-popula select com estados frescos antes de abrir o modal
    const stateSelect = document.getElementById('campus-state-select');
    stateSelect.innerHTML = '<option value="">Carregando...</option>';
    const states = await DataService.getStates();
    stateSelect.innerHTML = '<option value="">Selecione o Estado</option>' +
      states.map(s => `<option value="${s.id}">${_escHtml(s.name)}</option>`).join('');
    openModal('modal-campus');
  });

  document.getElementById('form-campus').addEventListener('submit', async e => {
    e.preventDefault();
    const name    = document.getElementById('campus-name').value.trim();
    const stateId = document.getElementById('campus-state-select').value;
    const btn     = e.target.querySelector('button[type=submit]');
    const setLoading = v => { btn.disabled = v; btn.textContent = v ? 'Salvando...' : 'Adicionar'; };

    if (!name || !stateId) return;
    setLoading(true);
    try {
      await DataService.addCampus(name, stateId);
      closeModal('modal-campus');
      document.getElementById('form-campus').reset();
      await Promise.all([loadCampusesView(), loadDashboard()]);
      showToast('Campus adicionado!', 'success');
    } catch (e) {
      showToast(e.message?.replace('VALIDATION: ','') || 'Erro ao adicionar campus.', 'error');
    } finally {
      setLoading(false);
    }
  });

  window.deleteCampus = async (id, name) => {
    if (!confirm(`Excluir o campus "${name}"?`)) return;
    try {
      await DataService.deleteCampus(id);
      await Promise.all([loadCampusesView(), loadDashboard()]);
      showToast('Campus excluído.', 'success');
    } catch {
      showToast('Erro ao excluir campus.', 'error');
    }
  };

  // ─── CARDÁPIOS ───────────────────────────────────────────────
  async function loadMenusView() {
    // Guarda de acesso: verifica role antes de carregar
    if (!isNutritionist()) {
      showToast('Acesso restrito. Apenas Nutricionistas podem gerenciar cardápios.', 'error');
      navigateTo('dashboard');
      return;
    }

    const states = await DataService.getStates();
    const stateSelect  = document.getElementById('menu-state-select');
    const campusSelect = document.getElementById('menu-campus-select');

    stateSelect.innerHTML = '<option value="">Selecione o Estado</option>' +
      states.map(s => `<option value="${s.id}">${_escHtml(s.name)}</option>`).join('');

    stateSelect.onchange = async () => {
      const sid = stateSelect.value;
      campusSelect.innerHTML = '<option value="">Selecione o Campus</option>';
      campusSelect.disabled  = true;
      if (!sid) return;
      const campi = await DataService.getCampi(sid);
      campusSelect.innerHTML = '<option value="">Selecione o Campus</option>' +
        campi.map(c => `<option value="${c.id}">${_escHtml(c.name)}</option>`).join('');
      campusSelect.disabled = false;
    };

    campusSelect.onchange = () => {
      menuCampusId = campusSelect.value;
      if (menuCampusId) {
        initWeekEditor();
        loadMenusCrud();  // Carrega CRUD de cardápios ao selecionar campus
      } else {
        document.getElementById('week-editor-section').style.display = 'none';
        document.getElementById('menus-crud-section').style.display  = 'none';
      }
    };

    // Semana atual por padrão
    const today = new Date();
    const { year, week } = DataService.getISOWeekInfo(today);
    menuYear = year;
    menuWeek = week;
    document.getElementById('menu-week-input').value = `${year}-W${String(week).padStart(2,'0')}`;

    document.getElementById('menu-week-input').addEventListener('change', e => {
      const [y, w] = e.target.value.split('-W');
      menuYear = parseInt(y);
      menuWeek = parseInt(w);
      if (menuCampusId) initWeekEditor();
    });
  }

  async function initWeekEditor() {
    if (!isNutritionist()) return;

    document.getElementById('week-editor-section').style.display = 'block';
    const dates    = DataService.getWeekDates(menuYear, menuWeek);
    const tabsEl   = document.getElementById('day-tabs');
    const panelsEl = document.getElementById('day-panels');
    tabsEl.innerHTML   = '';
    panelsEl.innerHTML = '';

    // Busca cardápio existente — passa uid para validação server-side
    const existing = await DataService.getMenu(menuCampusId, menuYear, menuWeek, currentUser.uid);
    menuData = {};

    // Ícones SVG por tipo de refeição (UI/UX Pro Max: no-emoji-icons)
    const MEAL_SVGS = {
      morning_break:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
      lunch:          `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>`,
      afternoon_break:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
      dinner:         `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>`,
      evening_break:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`,
    };
    const MEAL_HELPERS = {
      morning_break:   'Ex: Pão com manteiga, café com leite',
      lunch:           'Ex: Arroz, feijão, frango grelhado, salada',
      afternoon_break: 'Ex: Fruta, iogurte, biscoito integral',
      dinner:          'Ex: Sopa de legumes, pão integral',
      evening_break:   'Ex: Leite quente, bolachas',
    };

    DAY_KEYS.forEach((dayKey, i) => {
      const date    = dates[i];
      const dayData = existing?.[dayKey] ?? {};
      menuData[dayKey] = { ...dayData };
      const hasData = Object.values(dayData).some(v => v?.trim());

      // Tab
      const tab       = document.createElement('button');
      tab.className   = `day-tab${i === 0 ? ' active' : ''}${hasData ? ' has-data' : ''}`;
      tab.dataset.day = dayKey;
      tab.textContent = `${DAY_LABELS[i].split('-')[0]} ${date.getDate()}/${date.getMonth()+1}`;
      tab.addEventListener('click', () => switchDayTab(dayKey));
      tabsEl.appendChild(tab);

      // Panel

      const panel     = document.createElement('div');
      panel.className = `day-panel${i === 0 ? ' active' : ''}`;
      panel.id        = `panel-${dayKey}`;
      panel.innerHTML = `
        <div class="meals-form-grid">
          ${MEAL_KEYS.map((mk, mi) => `
            <div class="meal-form-card" data-meal="${mk}">
              <div class="meal-form-header">
                <div class="meal-form-label">
                  <div class="meal-form-icon">${MEAL_SVGS[mk]}</div>
                  ${MEAL_LABELS[mi]}
                </div>
                <span class="meal-filled-badge" id="badge-${dayKey}-${mk}">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  Preenchido
                </span>
              </div>
              <div class="meal-form-body">
                <textarea
                  id="meal-${dayKey}-${mk}"
                  placeholder="${MEAL_HELPERS[mk]}"
                  rows="3"
                  aria-label="${MEAL_LABELS[mi]}"
                >${_escHtml(dayData[mk] || '')}</textarea>
                <div class="meal-form-footer">
                  <span class="meal-helper-text">${MEAL_HELPERS[mk]}</span>
                  <span class="meal-char-count" id="count-${dayKey}-${mk}">0 caracteres</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-primary" id="btn-save-day-${dayKey}" onclick="saveDayMenu('${dayKey}')" aria-label="Salvar cardápio de ${DAY_LABELS[i]}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Salvar cardápio do dia
          </button>
          <div class="copy-day-wrapper">
            <button class="btn btn-outline" onclick="openCopyDayDropdown('${dayKey}', this)" aria-label="Copiar cardápio de outro dia da semana" aria-haspopup="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              Copiar cardápio do dia
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        </div>
      `;
      panelsEl.appendChild(panel);

      // Inicializa char counter + badge "Preenchido" para cada textarea
      MEAL_KEYS.forEach(mk => {
        const ta    = panel.querySelector(`#meal-${dayKey}-${mk}`);
        const count = panel.querySelector(`#count-${dayKey}-${mk}`);
        const badge = panel.querySelector(`#badge-${dayKey}-${mk}`);
        if (!ta) return;
        const update = () => {
          const len = ta.value.length;
          if (count) count.textContent = `${len} caractere${len !== 1 ? 's' : ''}`;
          if (badge) badge.style.display = ta.value.trim() ? 'inline-flex' : 'none';
        };
        ta.addEventListener('input', update);
        update(); // estado inicial
      });
    });

    // Btn-save-week removido da UI — salvar por dia via saveDayMenu()

  }

  function switchDayTab(dayKey) {
    document.querySelectorAll('.day-tab').forEach(t   => t.classList.remove('active'));
    document.querySelectorAll('.day-panel').forEach(p => p.classList.remove('active'));
    document.querySelector(`.day-tab[data-day="${dayKey}"]`).classList.add('active');
    document.getElementById(`panel-${dayKey}`).classList.add('active');
  }

  window.saveDayMenu = async (dayKey) => {
    if (!menuCampusId || !isNutritionist()) return;
    const meals = {};
    MEAL_KEYS.forEach(mk => {
      const el    = document.getElementById(`meal-${dayKey}-${mk}`);
      meals[mk]   = el ? el.value.trim() : '';
    });

    // ── Heurística Nielsen #5: Prevenção de Erros ──────────────
    // Se TODOS os campos estão em branco, pede confirmação antes de salvar
    const allBlank = MEAL_KEYS.every(mk => !meals[mk]);
    if (allBlank) {
      const dayLabel = DAY_LABELS[DAY_KEYS.indexOf(dayKey)] || dayKey;
      if (!confirm(`Todos os campos de "${dayLabel}" estão em branco.\nDeseja salvar mesmo assim? Isso apagará o conteúdo existente para este dia.`)) {
        return;
      }
    }
    // Loading state no botão
    const btn = document.getElementById(`btn-save-day-${dayKey}`);
    const SVG_SAVE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;
    const SVG_SPIN = `<svg class="spin-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a9 9 0 11-18 0"/></svg>`;
    if (btn) { btn.innerHTML = `${SVG_SPIN} Salvando...`; btn.disabled = true; }
    try {
      await DataService.saveMenu(menuCampusId, menuYear, menuWeek, dayKey, meals, currentUser.uid);
      menuData[dayKey] = meals;
      const hasData = Object.values(meals).some(v => v);
      const tab = document.querySelector(`.day-tab[data-day="${dayKey}"]`);
      if (tab) { hasData ? tab.classList.add('has-data') : tab.classList.remove('has-data'); }
      showToast('Cardápio do dia salvo!', 'success');
      // Atualiza CRUD de semanas e contador do dashboard em segundo plano
      setTimeout(() => Promise.all([renderWeeksCrud(), loadDashboard()]), 400);
    } catch (e) {
      showToast(e.message?.includes('ACCESS_DENIED') ? 'Sem permissão para salvar cardápios.' : 'Erro ao salvar.', 'error');
    } finally {
      if (btn) { btn.innerHTML = `${SVG_SAVE} Salvar cardápio do dia`; btn.disabled = false; }
    }
  };

  // ─── COPIAR DIA: abre dropdown para escolher o dia de origem ─────────
  window.openCopyDayDropdown = (targetDayKey, btnEl) => {
    // Fecha qualquer dropdown aberto
    document.querySelectorAll('.copy-day-dropdown').forEach(d => d.classList.remove('open'));

    const wrapper = btnEl.closest('.copy-day-wrapper');
    let dropdown  = wrapper.querySelector('.copy-day-dropdown');

    // Cria o dropdown na primeira vez
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'copy-day-dropdown';

      const label = document.createElement('div');
      label.className = 'copy-dropdown-label';
      label.textContent = 'Copiar refeições de:';
      dropdown.appendChild(label);

      DAY_KEYS.forEach((srcKey, idx) => {
        const srcData  = menuData[srcKey] || {};
        const hasData  = MEAL_KEYS.some(mk => srcData[mk]?.trim());
        const isCurrent = srcKey === targetDayKey;

        const opt = document.createElement('button');
        opt.type = 'button';
        opt.className = [
          'copy-day-option',
          hasData  ? 'has-data'    : 'empty-day',
          isCurrent ? 'current-day' : '',
        ].join(' ').trim();

        opt.innerHTML = `
          <span class="day-dot"></span>
          ${DAY_LABELS[idx]}
          ${hasData ? '<span style="margin-left:auto;font-size:0.72rem;color:var(--color-success)">✓ com dados</span>' : ''}
          ${isCurrent ? '<span style="margin-left:auto;font-size:0.72rem">(este dia)</span>' : ''}
        `;

        if (!isCurrent) {
          opt.addEventListener('click', () => {
            dropdown.classList.remove('open');
            _doCopyDay(srcKey, targetDayKey);
          });
        }
        dropdown.appendChild(opt);
      });

      wrapper.appendChild(dropdown);
    } else {
      // Atualiza os dots de has-data ao reabrir
      dropdown.querySelectorAll('.copy-day-option').forEach((opt, idx) => {
        const srcKey  = DAY_KEYS[idx];
        const hasData = MEAL_KEYS.some(mk => (menuData[srcKey] || {})[mk]?.trim());
        opt.classList.toggle('has-data',  hasData);
        opt.classList.toggle('empty-day', !hasData && srcKey !== targetDayKey);
      });
    }

    dropdown.classList.toggle('open');

    // Fecha ao clicar fora
    const closeHandler = (e) => {
      if (!wrapper.contains(e.target)) {
        dropdown.classList.remove('open');
        document.removeEventListener('click', closeHandler, true);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler, true), 0);
  };

  /**
   * Executa a cópia de um dia para outro.
   * Se o dia de destino já tiver dados, exibe modal de confirmação.
   * Após cópia, oferece botão "Desfazer" por 10 segundos (Heurística #3).
   */
  function _doCopyDay(srcKey, targetDayKey) {
    const srcData    = menuData[srcKey] || {};
    const allSrcEmpty= MEAL_KEYS.every(mk => !srcData[mk]?.trim());
    const targetData = {};
    MEAL_KEYS.forEach(mk => {
      const el = document.getElementById(`meal-${targetDayKey}-${mk}`);
      targetData[mk] = el ? el.value : '';
    });
    const targetHasData = MEAL_KEYS.some(mk => targetData[mk]?.trim());

    const performCopy = () => {
      MEAL_KEYS.forEach(mk => {
        const el = document.getElementById(`meal-${targetDayKey}-${mk}`);
        if (el) {
          el.value = srcData[mk] || '';
          el.dispatchEvent(new Event('input'));
        }
      });
      const srcLabel    = DAY_LABELS[DAY_KEYS.indexOf(srcKey)].split('-')[0];
      const targetLabel = DAY_LABELS[DAY_KEYS.indexOf(targetDayKey)].split('-')[0];
      _showUndoCopyToast(targetDayKey, targetData, srcLabel, targetLabel);
    };

    // Origem vazia: confirma via modal
    if (allSrcEmpty) {
      const srcLabel = DAY_LABELS[DAY_KEYS.indexOf(srcKey)];
      _showCopyConfirmModal(
        `"${srcLabel}" não tem refeições cadastradas.\nDeseja copiar mesmo assim? Isso limpará o dia de destino.`,
        performCopy
      );
      return;
    }

    // Destino já preenchido: confirma via modal
    if (targetHasData) {
      const srcLabel    = DAY_LABELS[DAY_KEYS.indexOf(srcKey)];
      const targetLabel = DAY_LABELS[DAY_KEYS.indexOf(targetDayKey)];
      _showCopyConfirmModal(
        `"${targetLabel}" já possui refeições cadastradas.\nAo copiar de "${srcLabel}", os dados existentes serão substituídos.\n\nEsta ação poderá ser desfeita logo após.`,
        performCopy
      );
      return;
    }

    // Sem conflito: copia direto
    performCopy();
  }

  /** Exibe o modal de confirmação de cópia e chama onConfirm() se aceito. */
  function _showCopyConfirmModal(message, onConfirm) {
    const overlay = document.getElementById('modal-copy-confirm');
    const bodyEl  = document.getElementById('copy-confirm-body');
    const cancelBtn = document.getElementById('btn-copy-cancel');
    const confirmBtn= document.getElementById('btn-copy-confirm');
    if (!overlay) { if (confirm(message)) onConfirm(); return; }

    bodyEl.textContent = message;
    overlay.style.display = 'flex';
    overlay.classList.add('open');

    const cleanup = () => {
      overlay.style.display = 'none';
      overlay.classList.remove('open');
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onOk);
    };
    const onCancel = () => cleanup();
    const onOk     = () => { cleanup(); onConfirm(); };
    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onOk);
  }

  /**
   * Exibe um toast com botão "Desfazer" após cópia de dia.
   * O botão fica ativo por 10 segundos.
   * Heurística Nielsen #3 — Controle e Liberdade do Usuário.
   */
  function _showUndoCopyToast(targetDayKey, previousData, srcLabel, targetLabel) {
    const container = document.getElementById('toast-container');
    const toast     = document.createElement('div');
    toast.className = 'toast success toast-with-undo';
    toast.setAttribute('role', 'alert');

    let secondsLeft = 10;
    const render = () => {
      toast.innerHTML = `
        <span>✅ Refeições de ${srcLabel} copiadas para ${targetLabel}.</span>
        <button class="toast-undo-btn" aria-label="Desfazer cópia">
          Desfazer <span class="undo-timer">(${secondsLeft}s)</span>
        </button>
      `;
      toast.querySelector('.toast-undo-btn').addEventListener('click', () => {
        // Restaura os dados anteriores nos campos
        MEAL_KEYS.forEach(mk => {
          const el = document.getElementById(`meal-${targetDayKey}-${mk}`);
          if (el) { el.value = previousData[mk] || ''; el.dispatchEvent(new Event('input')); }
        });
        clearInterval(countdown);
        toast.remove();
        showToast('Cópia desfeita. Dados anteriores restaurados.', 'info');
      });
    };

    render();
    container.appendChild(toast);

    const countdown = setInterval(() => {
      secondsLeft--;
      if (secondsLeft <= 0) {
        clearInterval(countdown);
        toast.style.animation = 'toast-out 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
        return;
      }
      const timerEl = toast.querySelector('.undo-timer');
      if (timerEl) timerEl.textContent = `(${secondsLeft}s)`;
    }, 1000);
  }


  window.refreshWeekEditor = () => {
    if (!menuCampusId) { showToast('Selecione um campus primeiro.', 'warning'); return; }
    initWeekEditor();
    showToast('Área de preenchimento recarregada.', 'success');
  };

  // "Salvar Semana Toda" removido — cada dia é salvo individualmente via saveDayMenu()

  // ─── CARDÁPIO POR DATA ESPECÍFICA ────────────────────────────
  document.getElementById('btn-specific-date').addEventListener('click', () => {
    if (!isNutritionist()) { showToast('Acesso restrito a Nutricionistas.', 'warning'); return; }
    openModal('modal-specific-date');
    populateSpecificDateModal();
  });

  function populateSpecificDateModal() {
    const today   = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    document.getElementById('specific-date-input').value = dateStr;

    const formEl = document.getElementById('specific-meals-form');
    formEl.innerHTML = MEAL_KEYS.map((mk, mi) => `
      <div class="meal-form-card" data-meal="${mk}">
        <div class="meal-form-header">
          <div class="meal-form-label">
            <div class="meal-form-icon">${MEAL_SVGS[mk]}</div>
            ${MEAL_LABELS[mi]}
          </div>
        </div>
        <div class="meal-form-body">
          <textarea id="specific-${mk}" placeholder="${MEAL_HELPERS[mk]}" rows="2" aria-label="${MEAL_LABELS[mi]}"></textarea>
          <div class="meal-form-footer">
            <span class="meal-helper-text">${MEAL_HELPERS[mk]}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  document.getElementById('form-specific-date').addEventListener('submit', async e => {
    e.preventDefault();
    if (!menuCampusId) { showToast('Selecione um campus primeiro.', 'warning'); return; }
    if (!isNutritionist()) { showToast('Sem permissão.', 'error'); return; }
    const dateStr = document.getElementById('specific-date-input').value;
    const meals   = {};
    MEAL_KEYS.forEach(mk => {
      meals[mk] = document.getElementById(`specific-${mk}`)?.value.trim() || '';
    });
    try {
      await DataService.saveDayMenu(menuCampusId, dateStr, meals, currentUser.uid);
      closeModal('modal-specific-date');
      showToast('Cardápio especial salvo!', 'success');
    } catch (e) {
      showToast(e.message?.includes('ACCESS_DENIED') ? 'Sem permissão.' : 'Erro ao salvar.', 'error');
    }
  });
  // ─── CRUD DE CARDÁPIOS ─────────────────────────────────────
  // Tab ativa: 'weeks' | 'specific'
  let _crudTab = 'weeks';

  /**
   * Carrega e exibe o painel CRUD de cardápios para o campus selecionado.
   */
  async function loadMenusCrud() {
    if (!menuCampusId || !isNutritionist()) return;
    const section = document.getElementById('menus-crud-section');
    section.style.display = 'block';
    await renderWeeksCrud();
  }

  /**
   * Alterna entre as tabs 'Semanais' e 'Específicos' no CRUD.
   */
  window.switchCrudTab = function(tab) {
    _crudTab = tab;
    document.getElementById('crud-tab-weeks').classList.toggle('active', tab === 'weeks');
    document.getElementById('crud-tab-specific').classList.toggle('active', tab === 'specific');
    document.getElementById('crud-panel-weeks').style.display    = tab === 'weeks'    ? '' : 'none';
    document.getElementById('crud-panel-specific').style.display = tab === 'specific' ? '' : 'none';

    // Adiciona listeners de click nos botões (só aqui pois são criados dinamicamente)
    document.getElementById('crud-tab-weeks').onclick    = () => switchCrudTab('weeks');
    document.getElementById('crud-tab-specific').onclick = () => switchCrudTab('specific');

    if (tab === 'weeks')    renderWeeksCrud();
    if (tab === 'specific') renderSpecificsCrud();
  };

  /**
   * Renderiza a listagem de cardápios semanais na tabela CRUD.
   */
  async function renderWeeksCrud() {
    const tbody = document.getElementById('menus-weeks-tbody');
    tbody.innerHTML = '<tr><td colspan="4"><div class="spinner"></div></td></tr>';
    try {
      const weeks = await DataService.listMenuWeeks(menuCampusId, currentUser.uid);
      if (!weeks.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted);padding:24px">Nenhum cardápio semanal cadastrado para este campus.</td></tr>';
        return;
      }

      tbody.innerHTML = weeks.map(w => {
        const dates = DataService.getWeekDates(w.year, w.week);
        const fmt   = d => `${d.getDate()}/${d.getMonth()+1}`;
        const periodStr = dates.length
          ? `${fmt(dates[0])} – ${fmt(dates[4])} de ${dates[0].getFullYear()}`
          : `Ano ${w.year}, Sem. ${w.week}`;

        const daysBar = Array.from({length:5}, (_, i) => {
          const filled = /* checado via w.daysCount aprox */ i < w.daysCount;
          return `<span class="days-dot ${filled ? 'filled' : ''}" title="${['Seg','Ter','Qua','Qui','Sex'][i]}"></span>`;
        }).join('');

        return `<tr>
          <td>
            <span class="badge badge-green">
              Semana ${w.week}/${w.year}
            </span>
          </td>
          <td style="color:var(--color-text-muted);font-size:0.85rem">${_escHtml(periodStr)}</td>
          <td>
            <div class="days-bar" aria-label="${w.daysCount} de 5 dias preenchidos">
              ${daysBar}
              <span style="font-size:0.78rem;color:var(--color-text-muted);margin-left:6px">${w.daysCount}/5 dias</span>
            </div>
          </td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button
                class="btn btn-outline btn-sm"
                onclick="editMenuWeek('${w.year}', '${w.week}')"
                aria-label="Editar cardápio semana ${w.week}/${w.year}"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Editar
              </button>
              <button
                class="btn btn-danger btn-sm"
                onclick="deleteMenuWeek('${w.id}', '${w.week}', '${w.year}')"
                aria-label="Excluir cardápio semana ${w.week}/${w.year}"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                Excluir
              </button>
            </div>
          </td>
        </tr>`;
      }).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4" style="color:var(--color-error);padding:16px">Erro ao carregar cardápios: ${_escHtml(e.message || '')}</td></tr>`;
    }
  }

  /**
   * Renderiza a listagem de cardápios de datas específicas no CRUD.
   */
  async function renderSpecificsCrud() {
    const tbody = document.getElementById('menus-specific-tbody');
    tbody.innerHTML = '<tr><td colspan="3"><div class="spinner"></div></td></tr>';
    try {
      const specifics = await DataService.listSpecificMenus(menuCampusId, currentUser.uid);
      if (!specifics.length) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--color-text-muted);padding:24px">Nenhum cardápio específico cadastrado.</td></tr>';
        return;
      }
      const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
      tbody.innerHTML = specifics.map(s => {
        const d = new Date(s.date + 'T12:00:00');
        const dateFormatted = `${d.getDate()} de ${MONTH_NAMES[d.getMonth()]} de ${d.getFullYear()}`;
        return `<tr>
          <td><strong>${_escHtml(dateFormatted)}</strong></td>
          <td><span class="badge" style="background:rgba(249,115,22,0.12);color:#c2410c">Data Específica</span></td>
          <td>
            <button
              class="btn btn-danger btn-sm"
              onclick="deleteSpecificMenu('${_escHtml(s.id)}', '${_escHtml(s.date)}')"
              aria-label="Excluir cardápio de ${_escHtml(dateFormatted)}"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              Excluir
            </button>
          </td>
        </tr>`;
      }).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="3" style="color:var(--color-error);padding:16px">Erro: ${_escHtml(e.message || '')}</td></tr>`;
    }
  }

  /**
   * Carrega a semana de um cardápio no editor para edição.
   * Equivale a setar o input de semana e disparar o editor.
   */
  window.editMenuWeek = function(year, week) {
    menuYear = parseInt(year);
    menuWeek = parseInt(week);
    // Atualiza o input de semana
    const weekInput = document.getElementById('menu-week-input');
    weekInput.value = `${year}-W${String(week).padStart(2,'0')}`;
    // Scroll suave até o editor
    document.getElementById('week-editor-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    initWeekEditor();
    showToast(`Cardápio da Semana ${week}/${year} carregado para edição.`, 'success');
  };

  /**
   * Exclui um cardápio semanal completo.
   */
  window.deleteMenuWeek = async function(docId, week, year) {
    if (!confirm(`Excluir o cardápio da Semana ${week}/${year} completo? Esta ação não pode ser desfeita.`)) return;
    try {
      await DataService.deleteMenu(docId, currentUser.uid);
      showToast(`Cardápio da Semana ${week}/${year} excluído.`, 'success');
      await Promise.all([renderWeeksCrud(), loadDashboard()]);
    } catch (e) {
      showToast(e.message?.includes('ACCESS_DENIED') ? 'Sem permissão.' : 'Erro ao excluir.', 'error');
    }
  };

  /**
   * Exclui um cardápio de data específica.
   */
  window.deleteSpecificMenu = async function(docId, dateStr) {
    if (!confirm(`Excluir o cardápio especial de ${dateStr}?`)) return;
    try {
      await DataService.deleteMenu(docId, currentUser.uid);
      showToast('Cardápio especial excluído.', 'success');
      await renderSpecificsCrud();
    } catch (e) {
      showToast(e.message?.includes('ACCESS_DENIED') ? 'Sem permissão.' : 'Erro ao excluir.', 'error');
    }
  };

  // Recarrega CRUD após salvar cardápio especial
  document.getElementById('form-specific-date').addEventListener('submit', async () => {
    // Aguarda 500ms para garantir que o save concluiu antes de recarregar
    setTimeout(() => loadMenusCrud(), 500);
  }, { capture: false });

  // Recarrega CRUD após salvar dia (via saveDayMenu já chama internamente — sem listener adicional necessário)

  // ─── USUÁRIOS ────────────────────────────────────────────────
  async function loadUsersView() {
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '<tr><td colspan="3"><div class="spinner"></div></td></tr>';
    try {
      const snap = await db.collection('users').get();
      if (!snap.size) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--color-text-muted)">Nenhum usuário cadastrado além de você</td></tr>';
        return;
      }
      tbody.innerHTML = snap.docs.map(d => {
        const u    = d.data();
        const role = u.role === 'nutritionist' ? 'Nutricionista' : (u.role || 'Não definido');
        return `<tr>
          <td>${_escHtml(u.email || '')}</td>
          <td>${_escHtml(u.name || '—')}</td>
          <td><span class="badge badge-green">${_escHtml(role)}</span></td>
        </tr>`;
      }).join('');
    } catch {
      tbody.innerHTML = '<tr><td colspan="3" style="color:var(--color-error)">Erro ao carregar usuários</td></tr>';
    }
  }

  document.getElementById('btn-add-user').addEventListener('click', () => {
    openModal('modal-user');
  });

  document.getElementById('form-user').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('user-email').value.trim();
    const name  = document.getElementById('user-display-name').value.trim();
    const pass  = document.getElementById('user-password').value;
    const btn   = e.target.querySelector('button[type=submit]');
    const setLoading = v => { btn.disabled = v; btn.textContent = v ? 'Criando...' : 'Criar Conta'; };

    setLoading(true);
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      await cred.user.updateProfile({ displayName: name });
      // Garante que o cargo 'nutritionist' é salvo no perfil
      await db.collection('users').doc(cred.user.uid).set({
        email,
        name,
        role: 'nutritionist',
        createdAt: new Date().toISOString(),
      });
      closeModal('modal-user');
      document.getElementById('form-user').reset();
      showToast('Nutricionista cadastrada! Ela já pode fazer login.', 'success');
      await loadUsersView();
    } catch (err) {
      showToast(translateAuthError(err.code) || err.message, 'error');
    } finally {
      setLoading(false);
    }
  });

  // ─── MODAIS ──────────────────────────────────────────────────
  function openModal(id) {
    document.getElementById(id).classList.add('open');
    // Foco no primeiro campo do modal para acessibilidade
    setTimeout(() => {
      const first = document.querySelector(`#${id} input, #${id} select, #${id} textarea`);
      if (first) first.focus();
    }, 150);
  }

  function closeModal(id) {
    document.getElementById(id).classList.remove('open');
  }

  window.closeModal = closeModal;

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // Fecha modais com Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m.id));
    }
  });

  // ─── TOAST ───────────────────────────────────────────────────
  function showToast(msg, type = '') {
    const container = document.getElementById('toast-container');
    const toast     = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'alert');
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `${icons[type] || 'ℹ️'} ${_escHtml(msg)}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toast-out 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3700);
  }



  // ─── UTILS ───────────────────────────────────────────────────
  /** Escapa HTML para prevenir XSS no innerHTML dinâmico */
  function _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

})();
