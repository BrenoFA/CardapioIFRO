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
  let _menuInventoryItems = [];  // itens do estoque para o seletor de ingredientes

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
      inventory: 'Estoque',
      campuses:  'Campi',
      states:    'Estados',
      users:     'Usuários'
    };
    document.getElementById('topbar-title').textContent = titles[view] || 'Admin';

    if (view === 'states')     loadStatesView();
    if (view === 'campuses')   loadCampusesView();
    if (view === 'menus')      loadMenusView();
    if (view === 'inventory')  loadInventoryView();
    if (view === 'dashboard')  loadDashboard();
    if (view === 'users')      loadUsersView();
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

      // Contagem de itens no estoque + alertas
      if (isNutritionist()) {
        try {
          const inventoryItems = await DataService.getInventory(currentUser.uid);
          document.getElementById('stat-inventory').textContent = inventoryItems.length;

          // Alertas de estoque baixo/crítico
          const alertItems = inventoryItems.filter(i => i.stockLevel === 'low' || i.stockLevel === 'critical');
          const alertCard = document.getElementById('inventory-alerts-card');
          const alertBody = document.getElementById('inventory-alerts-body');
          const badgeEl = document.getElementById('nav-badge-inventory');

          if (alertItems.length > 0) {
            alertCard.style.display = '';
            if (badgeEl) { badgeEl.textContent = alertItems.length; badgeEl.style.display = ''; }
            alertBody.innerHTML = `
              <div class="inventory-alert-list">
                ${alertItems.map(item => {
                  const catLabel = DataService.INVENTORY_CATEGORIES.find(c => c.id === item.category)?.label || item.category;
                  const statusClass = item.stockLevel === 'critical' ? 'stock-status-critical' : 'stock-status-low';
                  const statusLabel = item.stockLevel === 'critical' ? 'Crítico' : 'Baixo';
                  return `<div class="inventory-alert-item">
                    <div>
                      <strong>${_escHtml(item.name)}</strong>
                      <span style="color:var(--color-text-muted);font-size:0.82rem"> — ${_escHtml(catLabel)}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px">
                      <span style="font-size:0.85rem;font-weight:600">${item.quantity} ${_escHtml(item.unit)}</span>
                      <span class="stock-status ${statusClass}">${statusLabel}</span>
                    </div>
                  </div>`;
                }).join('')}
              </div>
            `;
          } else {
            alertCard.style.display = 'none';
            if (badgeEl) badgeEl.style.display = 'none';
          }
        } catch {
          document.getElementById('stat-inventory').textContent = '—';
        }
      }

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
    _showDeleteConfirmModal(
      `Deseja realmente excluir o estado "${name}"? Todos os campi associados serão perdidos.`,
      async () => {
        try {
          await DataService.deleteState(id);
          await Promise.all([loadStatesView(), loadDashboard()]);
          showToast('Estado excluído.', 'success');
        } catch {
          showToast('Erro ao excluir estado.', 'error');
        }
      }
    );
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
    _showDeleteConfirmModal(
      `Deseja realmente excluir o campus "${name}"?`,
      async () => {
        try {
          await DataService.deleteCampus(id);
          await Promise.all([loadCampusesView(), loadDashboard()]);
          showToast('Campus excluído.', 'success');
        } catch {
          showToast('Erro ao excluir campus.', 'error');
        }
      }
    );
  };

  // ─── CARDÁPIOS ───────────────────────────────────────────────
  async function loadMenusView() {
    // Guarda de acesso: verifica role antes de carregar
    if (!isNutritionist()) {
      showToast('Acesso restrito. Apenas Nutricionistas podem gerenciar cardápios.', 'error');
      navigateTo('dashboard');
      return;
    }

    // Campus fixo: IFRO Campus Ariquemes
    menuCampusId = 'ariquemes';

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
      initWeekEditor();
    });

    // Carrega itens do estoque para o seletor de ingredientes
    try {
      _menuInventoryItems = await DataService.getInventory(currentUser.uid);
    } catch (e) {
      console.error('Erro ao carregar estoque para seletor:', e);
      _menuInventoryItems = [];
    }

    // Inicializa o editor e o CRUD automaticamente
    initWeekEditor();
    loadMenusCrud();
  }

  async function initWeekEditor() {
    if (!isNutritionist()) return;

    document.getElementById('week-editor-section').style.display = 'block';
    const dates    = DataService.getWeekDates(menuYear, menuWeek);
    const tabsEl   = document.getElementById('day-tabs');
    const panelsEl = document.getElementById('day-panels');
    // Busca cardápio existente — passa uid para validação server-side
    const existing = await DataService.getMenu(menuCampusId, menuYear, menuWeek, currentUser.uid);

    tabsEl.innerHTML   = '';
    panelsEl.innerHTML = '';
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

    // Gera opções do select de ingredientes uma vez
    const _ingredientOptions = _menuInventoryItems.map(item =>
      `<option value="${item.id}" data-unit="${_escHtml(item.unit)}">${_escHtml(item.name)} (${item.quantity} ${_escHtml(item.unit)} disp.)</option>`
    ).join('');

    DAY_KEYS.forEach((dayKey, i) => {
      const date    = dates[i];
      const dayData = existing?.[dayKey] ?? {};

      // Inicializa menuData com arrays (novo formato)
      menuData[dayKey] = {};
      MEAL_KEYS.forEach(mk => {
        const val = dayData[mk];
        menuData[dayKey][mk] = Array.isArray(val) ? val.map(v => ({...v})) : [];
      });

      const hasData = MEAL_KEYS.some(mk => menuData[dayKey][mk].length > 0);

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
                <span class="meal-filled-badge" id="badge-${dayKey}-${mk}" style="display:none">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  <span class="badge-count">0 itens</span>
                </span>
              </div>
              <div class="meal-form-body">
                <div class="ingredient-chips" id="chips-${dayKey}-${mk}"></div>
                <div class="ingredient-add-row">
                  <select id="sel-${dayKey}-${mk}" class="ingredient-select" aria-label="Selecionar ingrediente para ${MEAL_LABELS[mi]}">
                    <option value="">Selecione um item do estoque...</option>
                    ${_ingredientOptions}
                  </select>
                  <div class="ingredient-qty-wrap">
                    <input type="number" id="qty-${dayKey}-${mk}" class="ingredient-qty"
                           placeholder="Qtd" step="0.1" min="0.1" aria-label="Quantidade">
                    <span class="ingredient-unit" id="unit-${dayKey}-${mk}"></span>
                  </div>
                  <button type="button" class="btn btn-sm btn-primary ingredient-add-btn"
                          onclick="addIngredient('${dayKey}','${mk}')" aria-label="Adicionar ingrediente">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Adicionar
                  </button>
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

      // Inicializa: mostra unidade ao selecionar item + renderiza chips existentes
      MEAL_KEYS.forEach(mk => {
        const selectEl = panel.querySelector(`#sel-${dayKey}-${mk}`);
        const unitEl   = panel.querySelector(`#unit-${dayKey}-${mk}`);
        if (selectEl) {
          selectEl.addEventListener('change', () => {
            const item = _menuInventoryItems.find(it => it.id === selectEl.value);
            if (unitEl) unitEl.textContent = item ? item.unit : '';
          });
        }
        _renderMealChips(dayKey, mk);
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

    // Monta o objeto de refeições a partir do menuData (arrays de ingredientes)
    const meals = {};
    MEAL_KEYS.forEach(mk => {
      meals[mk] = Array.isArray(menuData[dayKey]?.[mk]) ? menuData[dayKey][mk] : [];
    });

    // Prevenção de erros: se todos vazios, confirma
    const allEmpty = MEAL_KEYS.every(mk => meals[mk].length === 0);
    if (allEmpty) {
      const dayLabel = DAY_LABELS[DAY_KEYS.indexOf(dayKey)] || dayKey;
      if (!confirm(`Nenhum ingrediente selecionado em "${dayLabel}".\nDeseja salvar mesmo assim? Isso apagará o conteúdo existente para este dia.`)) {
        return;
      }
    }

    // Loading state
    const btn = document.getElementById(`btn-save-day-${dayKey}`);
    const SVG_SAVE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;
    const SVG_SPIN = `<svg class="spin-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a9 9 0 11-18 0"/></svg>`;
    if (btn) { btn.innerHTML = `${SVG_SPIN} Salvando e atualizando estoque...`; btn.disabled = true; }

    try {
      // Usa a nova função com desconto atômico de estoque
      await DataService.saveMenuWithStock(menuCampusId, menuYear, menuWeek, dayKey, meals, currentUser.uid);

      const hasData = MEAL_KEYS.some(mk => meals[mk].length > 0);
      const tab = document.querySelector(`.day-tab[data-day="${dayKey}"]`);
      if (tab) { hasData ? tab.classList.add('has-data') : tab.classList.remove('has-data'); }
      showToast('Cardápio salvo e estoque atualizado!', 'success');

      // Recarrega estoque em background para refletir as mudanças
      setTimeout(async () => {
        try { _menuInventoryItems = await DataService.getInventory(currentUser.uid); } catch(e) {}
        Promise.all([renderWeeksCrud(), loadDashboard()]);
      }, 400);
    } catch (e) {
      console.error('Erro ao salvar cardápio:', e);
      const msg = e.message?.includes('Estoque insuficiente')
        ? e.message
        : e.message?.includes('ACCESS_DENIED')
          ? 'Sem permissão para salvar cardápios.'
          : 'Erro ao salvar: ' + (e.message || '');
      showToast(msg, 'error');
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
    const srcData = menuData[srcKey] || {};
    const allSrcEmpty = MEAL_KEYS.every(mk => !Array.isArray(srcData[mk]) || srcData[mk].length === 0);

    // Salva dados atuais do destino para possível undo
    const previousData = {};
    MEAL_KEYS.forEach(mk => {
      previousData[mk] = Array.isArray(menuData[targetDayKey]?.[mk])
        ? menuData[targetDayKey][mk].map(item => ({...item}))
        : [];
    });
    const targetHasData = MEAL_KEYS.some(mk => previousData[mk].length > 0);

    const performCopy = () => {
      MEAL_KEYS.forEach(mk => {
        menuData[targetDayKey][mk] = Array.isArray(srcData[mk])
          ? srcData[mk].map(item => ({...item}))
          : [];
        _renderMealChips(targetDayKey, mk);
      });
      const srcLabel    = DAY_LABELS[DAY_KEYS.indexOf(srcKey)].split('-')[0];
      const targetLabel = DAY_LABELS[DAY_KEYS.indexOf(targetDayKey)].split('-')[0];
      _showUndoCopyToast(targetDayKey, previousData, srcLabel, targetLabel);
    };

    if (allSrcEmpty) {
      const srcLabel = DAY_LABELS[DAY_KEYS.indexOf(srcKey)];
      _showCopyConfirmModal(
        `"${srcLabel}" não tem ingredientes cadastrados.\nDeseja copiar mesmo assim? Isso limpará o dia de destino.`,
        performCopy
      );
      return;
    }

    if (targetHasData) {
      const srcLabel    = DAY_LABELS[DAY_KEYS.indexOf(srcKey)];
      const targetLabel = DAY_LABELS[DAY_KEYS.indexOf(targetDayKey)];
      _showCopyConfirmModal(
        `"${targetLabel}" já possui ingredientes cadastrados.\nAo copiar de "${srcLabel}", os dados existentes serão substituídos.\n\nEsta ação poderá ser desfeita logo após.`,
        performCopy
      );
      return;
    }

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
        // Restaura os dados anteriores (arrays de ingredientes)
        MEAL_KEYS.forEach(mk => {
          menuData[targetDayKey][mk] = Array.isArray(previousData[mk])
            ? previousData[mk].map(item => ({...item}))
            : [];
          _renderMealChips(targetDayKey, mk);
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


  window.refreshWeekEditor = async () => {
    if (!menuCampusId) { showToast('Selecione um campus primeiro.', 'warning'); return; }
    // Recarrega inventário antes de recarregar o editor
    try { _menuInventoryItems = await DataService.getInventory(currentUser.uid); } catch(e) {}
    initWeekEditor();
    showToast('Área de preenchimento recarregada.', 'success');
  };

  // ─── FUNÇÕES DO SELETOR DE INGREDIENTES ─────────────────────

  /**
   * Renderiza os chips de ingredientes selecionados para uma refeição.
   */
  function _renderMealChips(dayKey, mealKey) {
    const chipsEl = document.getElementById(`chips-${dayKey}-${mealKey}`);
    if (!chipsEl) return;
    const items = menuData[dayKey]?.[mealKey] || [];

    if (!items.length) {
      chipsEl.innerHTML = '<div class="ingredient-empty">Nenhum ingrediente selecionado</div>';
    } else {
      chipsEl.innerHTML = items.map((item, idx) => `
        <div class="ingredient-chip">
          <span class="chip-name">${_escHtml(item.name)}</span>
          <span class="chip-qty">${item.qty} ${_escHtml(item.unit)}</span>
          <button type="button" class="chip-remove" onclick="removeIngredient('${dayKey}','${mealKey}',${idx})"
                  aria-label="Remover ${_escHtml(item.name)}">×</button>
        </div>
      `).join('');
    }

    // Atualiza badge de contagem
    const badge = document.getElementById(`badge-${dayKey}-${mealKey}`);
    if (badge) {
      badge.style.display = items.length ? 'inline-flex' : 'none';
      const countEl = badge.querySelector('.badge-count');
      if (countEl) countEl.textContent = `${items.length} ${items.length === 1 ? 'item' : 'itens'}`;
    }
  }

  /**
   * Adiciona um ingrediente do estoque a uma refeição.
   */
  window.addIngredient = function(dayKey, mealKey) {
    const selectEl = document.getElementById(`sel-${dayKey}-${mealKey}`);
    const qtyEl    = document.getElementById(`qty-${dayKey}-${mealKey}`);
    if (!selectEl || !qtyEl) return;

    const itemId = selectEl.value;
    const qty    = parseFloat(qtyEl.value);

    if (!itemId) { showToast('Selecione um item do estoque.', 'warning'); return; }
    if (!qty || qty <= 0) { showToast('Informe uma quantidade válida.', 'warning'); return; }

    // Busca dados do item no cache de inventário
    const invItem = _menuInventoryItems.find(i => i.id === itemId);
    if (!invItem) { showToast('Item não encontrado no estoque.', 'error'); return; }

    if (qty > invItem.quantity) {
      showToast(`Estoque insuficiente. Disponível: ${invItem.quantity} ${invItem.unit}.`, 'warning');
      return;
    }

    // Verifica se já está na lista (permite duplicata somando qty)
    if (!menuData[dayKey]) menuData[dayKey] = {};
    if (!Array.isArray(menuData[dayKey][mealKey])) menuData[dayKey][mealKey] = [];

    const existing = menuData[dayKey][mealKey].find(i => i.id === itemId);
    if (existing) {
      existing.qty += qty;
    } else {
      menuData[dayKey][mealKey].push({
        id:   invItem.id,
        name: invItem.name,
        qty:  qty,
        unit: invItem.unit,
      });
    }

    // Deduz do cache local e atualiza UI
    invItem.quantity -= qty;
    _updateIngredientOptions();

    // Re-renderiza chips
    _renderMealChips(dayKey, mealKey);

    // Limpa campos
    selectEl.value = '';
    qtyEl.value = '';
    const unitEl = document.getElementById(`unit-${dayKey}-${mealKey}`);
    if (unitEl) unitEl.textContent = '';
  };

  /**
   * Remove um ingrediente de uma refeição pelo índice.
   */
  window.removeIngredient = function(dayKey, mealKey, idx) {
    if (!menuData[dayKey]?.[mealKey]) return;
    const item = menuData[dayKey][mealKey][idx];
    const invItem = _menuInventoryItems.find(i => i.id === item.id);
    if (invItem) {
      invItem.quantity += item.qty;
      _updateIngredientOptions();
    }
    menuData[dayKey][mealKey].splice(idx, 1);
    _renderMealChips(dayKey, mealKey);
  };

  /**
   * Atualiza o texto das opções de select de ingredientes com a quantidade disponível atual
   */
  function _updateIngredientOptions() {
    _menuInventoryItems.forEach(item => {
      document.querySelectorAll(`option[value="${item.id}"]`).forEach(opt => {
        opt.textContent = `${item.name} (${item.quantity} ${item.unit} disp.)`;
      });
    });
  }

  // "Salvar Semana Toda" removido — cada dia é salvo individualmente via saveDayMenu()

  // ─── CARDÁPIO POR DATA ESPECÍFICA ────────────────────────────
  document.getElementById('btn-specific-date').addEventListener('click', () => {
    if (!isNutritionist()) { showToast('Acesso restrito a Nutricionistas.', 'warning'); return; }
    openModal('modal-specific-date');
    populateSpecificDateModal();
  });

  // Estado temporário para cardápio de data específica
  let _specificMenuData = {};

  function populateSpecificDateModal() {
    const today   = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    document.getElementById('specific-date-input').value = dateStr;

    // Inicializa estado temporário
    _specificMenuData = {};
    MEAL_KEYS.forEach(mk => { _specificMenuData[mk] = []; });

    const _ingredientOptions = _menuInventoryItems.map(item =>
      `<option value="${item.id}" data-unit="${_escHtml(item.unit)}">${_escHtml(item.name)} (${item.quantity} ${_escHtml(item.unit)} disp.)</option>`
    ).join('');

    const MEAL_SVGS_LOCAL = {
      morning_break: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
      lunch: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>`,
      afternoon_break: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/></svg>`,
      dinner: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>`,
      evening_break: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`,
    };

    const formEl = document.getElementById('specific-meals-form');
    formEl.innerHTML = MEAL_KEYS.map((mk, mi) => `
      <div class="meal-form-card" data-meal="${mk}">
        <div class="meal-form-header">
          <div class="meal-form-label">
            <div class="meal-form-icon">${MEAL_SVGS_LOCAL[mk]}</div>
            ${MEAL_LABELS[mi]}
          </div>
          <span class="meal-filled-badge" id="badge-specific-${mk}" style="display:none">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            <span class="badge-count">0 itens</span>
          </span>
        </div>
        <div class="meal-form-body">
          <div class="ingredient-chips" id="chips-specific-${mk}"></div>
          <div class="ingredient-add-row">
            <select id="sel-specific-${mk}" class="ingredient-select" aria-label="Selecionar ingrediente">
              <option value="">Selecione um item do estoque...</option>
              ${_ingredientOptions}
            </select>
            <div class="ingredient-qty-wrap">
              <input type="number" id="qty-specific-${mk}" class="ingredient-qty" placeholder="Qtd" step="0.1" min="0.1">
              <span class="ingredient-unit" id="unit-specific-${mk}"></span>
            </div>
            <button type="button" class="btn btn-sm btn-primary ingredient-add-btn"
                    onclick="addSpecificIngredient('${mk}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Adicionar
            </button>
          </div>
        </div>
      </div>
    `).join('');

    // Event listeners para mostrar unidade
    MEAL_KEYS.forEach(mk => {
      const selectEl = document.getElementById(`sel-specific-${mk}`);
      const unitEl   = document.getElementById(`unit-specific-${mk}`);
      if (selectEl) {
        selectEl.addEventListener('change', () => {
          const item = _menuInventoryItems.find(it => it.id === selectEl.value);
          if (unitEl) unitEl.textContent = item ? item.unit : '';
        });
      }
      _renderSpecificChips(mk);
    });
  }

  function _renderSpecificChips(mealKey) {
    const chipsEl = document.getElementById(`chips-specific-${mealKey}`);
    if (!chipsEl) return;
    const items = _specificMenuData[mealKey] || [];
    if (!items.length) {
      chipsEl.innerHTML = '<div class="ingredient-empty">Nenhum ingrediente selecionado</div>';
    } else {
      chipsEl.innerHTML = items.map((item, idx) => `
        <div class="ingredient-chip">
          <span class="chip-name">${_escHtml(item.name)}</span>
          <span class="chip-qty">${item.qty} ${_escHtml(item.unit)}</span>
          <button type="button" class="chip-remove" onclick="removeSpecificIngredient('${mealKey}',${idx})" aria-label="Remover">×</button>
        </div>
      `).join('');
    }
    const badge = document.getElementById(`badge-specific-${mealKey}`);
    if (badge) {
      badge.style.display = items.length ? 'inline-flex' : 'none';
      const countEl = badge.querySelector('.badge-count');
      if (countEl) countEl.textContent = `${items.length} ${items.length === 1 ? 'item' : 'itens'}`;
    }
  }

  window.addSpecificIngredient = function(mealKey) {
    const selectEl = document.getElementById(`sel-specific-${mealKey}`);
    const qtyEl    = document.getElementById(`qty-specific-${mealKey}`);
    if (!selectEl || !qtyEl) return;
    const itemId = selectEl.value;
    const qty    = parseFloat(qtyEl.value);
    if (!itemId) { showToast('Selecione um item.', 'warning'); return; }
    if (!qty || qty <= 0) { showToast('Informe uma quantidade válida.', 'warning'); return; }
    const invItem = _menuInventoryItems.find(i => i.id === itemId);
    if (!invItem) return;

    if (qty > invItem.quantity) {
      showToast(`Estoque insuficiente. Disponível: ${invItem.quantity} ${invItem.unit}.`, 'warning');
      return;
    }

    if (!_specificMenuData[mealKey]) _specificMenuData[mealKey] = [];
    const existing = _specificMenuData[mealKey].find(i => i.id === itemId);
    if (existing) { existing.qty += qty; } else {
      _specificMenuData[mealKey].push({ id: invItem.id, name: invItem.name, qty, unit: invItem.unit });
    }

    // Atualiza estoque na UI
    invItem.quantity -= qty;
    _updateIngredientOptions();

    _renderSpecificChips(mealKey);
    selectEl.value = ''; qtyEl.value = '';
    const unitEl = document.getElementById(`unit-specific-${mealKey}`);
    if (unitEl) unitEl.textContent = '';
  };

  window.removeSpecificIngredient = function(mealKey, idx) {
    if (!_specificMenuData[mealKey]) return;
    const item = _specificMenuData[mealKey][idx];
    const invItem = _menuInventoryItems.find(i => i.id === item.id);
    if (invItem) {
      invItem.quantity += item.qty;
      _updateIngredientOptions();
    }
    _specificMenuData[mealKey].splice(idx, 1);
    _renderSpecificChips(mealKey);
  }

  document.getElementById('form-specific-date').addEventListener('submit', async e => {
    e.preventDefault();
    if (!menuCampusId) { showToast('Selecione um campus primeiro.', 'warning'); return; }
    if (!isNutritionist()) { showToast('Sem permissão.', 'error'); return; }
    const dateStr = document.getElementById('specific-date-input').value;

    // Monta meals a partir do estado temporário
    const meals = {};
    MEAL_KEYS.forEach(mk => {
      meals[mk] = Array.isArray(_specificMenuData[mk]) ? _specificMenuData[mk] : [];
    });

    const btn = e.target.querySelector('button[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      await DataService.saveDayMenuWithStock(menuCampusId, dateStr, meals, currentUser.uid);
      closeModal('modal-specific-date');
      showToast('Cardápio especial salvo e estoque atualizado!', 'success');
      // Recarrega estoque
      setTimeout(async () => {
        try { _menuInventoryItems = await DataService.getInventory(currentUser.uid); } catch(e) {}
        loadDashboard();
      }, 300);
    } catch (e) {
      const msg = e.message?.includes('Estoque insuficiente')
        ? e.message
        : e.message?.includes('ACCESS_DENIED') ? 'Sem permissão.' : 'Erro ao salvar.';
      showToast(msg, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar Cardápio'; }
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
   * Exibe o modal de confirmação de exclusão e chama onConfirm() se aceito.
   */
  function _showDeleteConfirmModal(message, onConfirm) {
    const overlay = document.getElementById('modal-delete-confirm');
    const bodyEl  = document.getElementById('delete-confirm-body');
    const cancelBtn = document.getElementById('btn-delete-cancel');
    const confirmBtn= document.getElementById('btn-delete-confirm');
    if (!overlay) { if (confirm(message)) onConfirm(); return; }

    bodyEl.textContent = message;
    openModal('modal-delete-confirm');

    // Remove event listeners antigos clonando os botões
    const cancelBtnClone = cancelBtn.cloneNode(true);
    const confirmBtnClone = confirmBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(cancelBtnClone, cancelBtn);
    confirmBtn.parentNode.replaceChild(confirmBtnClone, confirmBtn);

    const cleanup = () => {
      closeModal('modal-delete-confirm');
    };

    cancelBtnClone.addEventListener('click', () => cleanup());
    confirmBtnClone.addEventListener('click', () => {
      cleanup();
      onConfirm();
    });
  }

  /**
   * Exclui um cardápio semanal completo.
   */
  window.deleteMenuWeek = async function(docId, week, year) {
    _showDeleteConfirmModal(
      `Deseja realmente excluir o cardápio completo da Semana ${week}/${year}?`,
      async () => {
        try {
          await DataService.deleteMenu(docId, currentUser.uid);
          showToast(`Cardápio da Semana ${week}/${year} excluído.`, 'success');
          await Promise.all([renderWeeksCrud(), loadDashboard()]);
        } catch (e) {
          showToast(e.message?.includes('ACCESS_DENIED') ? 'Sem permissão.' : 'Erro ao excluir.', 'error');
        }
      }
    );
  };

  /**
   * Exclui um cardápio de data específica.
   */
  window.deleteSpecificMenu = async function(docId, dateStr) {
    const parts = dateStr.split('-');
    const dateFormatted = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;

    _showDeleteConfirmModal(
      `Deseja realmente excluir o cardápio especial de ${dateFormatted}?`,
      async () => {
        try {
          await DataService.deleteMenu(docId, currentUser.uid);
          showToast('Cardápio especial excluído.', 'success');
          await renderSpecificsCrud();
        } catch (e) {
          showToast(e.message?.includes('ACCESS_DENIED') ? 'Sem permissão.' : 'Erro ao excluir.', 'error');
        }
      }
    );
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

  // ─── ESTOQUE ─────────────────────────────────────────────────
  let _inventoryData = [];  // cache local dos itens

  async function loadInventoryView() {
    if (!isNutritionist()) {
      showToast('Acesso restrito. Apenas Nutricionistas podem gerenciar o estoque.', 'error');
      navigateTo('dashboard');
      return;
    }

    // Popula selects de categoria nos filtros e no modal
    _populateInventorySelects();

    // Carrega dados
    await _renderInventoryTable();

    // Listeners de filtro (remove antigos para evitar duplicação)
    const searchEl = document.getElementById('inventory-search');
    const catFilterEl = document.getElementById('inventory-category-filter');
    const statusFilterEl = document.getElementById('inventory-status-filter');

    const filterHandler = () => _applyInventoryFilters();
    searchEl.oninput = filterHandler;
    catFilterEl.onchange = filterHandler;
    statusFilterEl.onchange = filterHandler;
  }

  function _populateInventorySelects() {
    const categories = DataService.INVENTORY_CATEGORIES;
    const units = DataService.INVENTORY_UNITS;

    // Filtro de categoria
    const catFilter = document.getElementById('inventory-category-filter');
    catFilter.innerHTML = '<option value="">Todas as categorias</option>' +
      categories.map(c => `<option value="${c.id}">${_escHtml(c.label)}</option>`).join('');

    // Modal: categoria
    const catSelect = document.getElementById('inventory-category');
    catSelect.innerHTML = '<option value="">Selecione</option>' +
      categories.map(c => `<option value="${c.id}">${_escHtml(c.label)}</option>`).join('');

    // Modal: unidade
    const unitSelect = document.getElementById('inventory-unit');
    unitSelect.innerHTML = '<option value="">Selecione</option>' +
      units.map(u => `<option value="${u.id}">${_escHtml(u.label)}</option>`).join('');
  }

  async function _renderInventoryTable() {
    const tbody = document.getElementById('inventory-table-body');
    tbody.innerHTML = '<tr><td colspan="6"><div class="spinner"></div></td></tr>';
    try {
      _inventoryData = await DataService.getInventory(currentUser.uid);
      _updateInventoryStats();
      _applyInventoryFilters();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" style="color:var(--color-error);padding:16px">Erro ao carregar estoque: ${_escHtml(e.message || '')}</td></tr>`;
    }
  }

  /**
   * Atualiza os stat cards e o painel de alertas do estoque.
   */
  function _updateInventoryStats() {
    const total    = _inventoryData.length;
    const lowItems = _inventoryData.filter(i => i.stockLevel === 'low');
    const critItems= _inventoryData.filter(i => i.stockLevel === 'critical');
    const alertItems = [...critItems, ...lowItems]; // críticos primeiro

    // Stats cards
    document.getElementById('inv-stat-total').textContent    = total;
    document.getElementById('inv-stat-low').textContent      = lowItems.length;
    document.getElementById('inv-stat-critical').textContent  = critItems.length;

    // Painel de alertas
    const panel     = document.getElementById('inv-alerts-panel');
    const listEl    = document.getElementById('inv-alerts-list');
    const countBadge= document.getElementById('inv-alerts-count');
    const categories = DataService.INVENTORY_CATEGORIES;
    const catMap     = Object.fromEntries(categories.map(c => [c.id, c.label]));

    if (alertItems.length === 0) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = '';
    countBadge.textContent = `${alertItems.length} ${alertItems.length === 1 ? 'item' : 'itens'}`;

    listEl.innerHTML = alertItems.map(item => {
      const catLabel = catMap[item.category] || item.category;
      const isCritical = item.stockLevel === 'critical';
      const statusClass = isCritical ? 'stock-status-critical' : 'stock-status-low';
      const statusLabel = isCritical ? 'Crítico' : 'Baixo';
      // Barra de progresso: quanto do minStock ainda resta
      const pct = item.minStock > 0 ? Math.min(100, Math.max(0, (item.quantity / item.minStock) * 100)) : 0;
      const barColor = isCritical ? '#dc2626' : '#d97706';

      return `<div class="inv-alert-row">
        <div class="inv-alert-info">
          <div class="inv-alert-name">
            <strong>${_escHtml(item.name)}</strong>
            <span class="stock-status ${statusClass}" style="font-size:0.7rem;padding:2px 8px">${statusLabel}</span>
          </div>
          <div class="inv-alert-meta">
            <span class="badge badge-gray" style="font-size:0.7rem">${_escHtml(catLabel)}</span>
          </div>
        </div>
        <div class="inv-alert-quantity">
          <div class="inv-alert-bar-wrap">
            <div class="inv-alert-bar" style="width:${pct}%;background:${barColor}"></div>
          </div>
          <div class="inv-alert-nums">
            <span class="inv-alert-current">${item.quantity} ${_escHtml(item.unit)}</span>
            <span class="inv-alert-sep">de</span>
            <span class="inv-alert-min">${item.minStock} ${_escHtml(item.unit)} mín.</span>
          </div>
        </div>

      </div>`;
    }).join('');
  }

  function _applyInventoryFilters() {
    const search = (document.getElementById('inventory-search')?.value || '').toLowerCase().trim();
    const catFilter = document.getElementById('inventory-category-filter')?.value || '';
    const statusFilter = document.getElementById('inventory-status-filter')?.value || '';
    const categories = DataService.INVENTORY_CATEGORIES;
    const catMap = Object.fromEntries(categories.map(c => [c.id, c.label]));

    let filtered = _inventoryData;
    if (search) filtered = filtered.filter(i => i.name.toLowerCase().includes(search));
    if (catFilter) filtered = filtered.filter(i => i.category === catFilter);
    if (statusFilter) filtered = filtered.filter(i => i.stockLevel === statusFilter);

    const tbody = document.getElementById('inventory-table-body');
    if (!filtered.length) {
      const msg = _inventoryData.length ? 'Nenhum item encontrado com os filtros aplicados.' : 'Nenhum item no estoque. Clique em "Novo Item" para começar.';
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);padding:24px">${msg}</td></tr>`;
      return;
    }

    const statusConfig = {
      normal:   { label: 'Normal',  cssClass: 'stock-status-normal' },
      low:      { label: 'Baixo',   cssClass: 'stock-status-low' },
      critical: { label: 'Crítico', cssClass: 'stock-status-critical' },
    };

    tbody.innerHTML = filtered.map(item => {
      const cat = catMap[item.category] || item.category;
      const st = statusConfig[item.stockLevel] || statusConfig.normal;
      return `<tr>
        <td><strong>${_escHtml(item.name)}</strong></td>
        <td><span class="badge badge-gray">${_escHtml(cat)}</span></td>
        <td>
          <div class="stock-quantity-cell">
            <span class="stock-quantity-value">${item.quantity}</span>
            <span class="stock-quantity-unit">${_escHtml(item.unit)}</span>
          </div>
        </td>
        <td style="color:var(--color-text-muted)">${item.minStock} ${_escHtml(item.unit)}</td>
        <td><span class="stock-status ${st.cssClass}">${st.label}</span></td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" onclick="editInventoryItem('${item.id}')" aria-label="Editar ${_escHtml(item.name)}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Editar
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteInventoryItem('${item.id}','${_escHtml(item.name)}')" aria-label="Excluir ${_escHtml(item.name)}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              Excluir
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // Abrir modal para novo item
  document.getElementById('btn-add-inventory').addEventListener('click', () => {
    if (!isNutritionist()) { showToast('Acesso restrito a Nutricionistas.', 'warning'); return; }
    document.getElementById('inventory-edit-id').value = '';
    document.getElementById('form-inventory').reset();
    document.getElementById('modal-inventory-title-text').textContent = 'Novo Item';
    document.getElementById('btn-inventory-submit').textContent = 'Adicionar';
    _populateInventorySelects();
    openModal('modal-inventory');
  });

  // Editar item existente
  window.editInventoryItem = function(id) {
    const item = _inventoryData.find(i => i.id === id);
    if (!item) { showToast('Item não encontrado.', 'error'); return; }
    _populateInventorySelects();
    document.getElementById('inventory-edit-id').value = id;
    document.getElementById('inventory-name').value = item.name;
    document.getElementById('inventory-category').value = item.category;
    document.getElementById('inventory-unit').value = item.unit;
    document.getElementById('inventory-quantity').value = item.quantity;
    document.getElementById('inventory-min-stock').value = item.minStock;
    document.getElementById('modal-inventory-title-text').textContent = 'Editar Item';
    document.getElementById('btn-inventory-submit').textContent = 'Salvar';
    openModal('modal-inventory');
  };

  // Salvar (criar ou atualizar)
  document.getElementById('form-inventory').addEventListener('submit', async e => {
    e.preventDefault();
    if (!isNutritionist()) { showToast('Sem permissão.', 'error'); return; }
    const editId = document.getElementById('inventory-edit-id').value;
    const itemData = {
      name:     document.getElementById('inventory-name').value.trim(),
      category: document.getElementById('inventory-category').value,
      unit:     document.getElementById('inventory-unit').value,
      quantity: parseFloat(document.getElementById('inventory-quantity').value) || 0,
      minStock: parseFloat(document.getElementById('inventory-min-stock').value) || 0,
    };

    const btn = document.getElementById('btn-inventory-submit');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
      if (editId) {
        await DataService.updateInventoryItem(editId, itemData, currentUser.uid);
        showToast('Item atualizado com sucesso!', 'success');
      } else {
        await DataService.addInventoryItem(itemData, currentUser.uid);
        showToast('Item adicionado ao estoque!', 'success');
      }
      closeModal('modal-inventory');
      document.getElementById('form-inventory').reset();
      await _renderInventoryTable();
      // Atualiza dashboard em background
      setTimeout(() => loadDashboard(), 300);
    } catch (err) {
      showToast(err.message?.replace('VALIDATION: ', '') || 'Erro ao salvar item.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  // Excluir item
  window.deleteInventoryItem = async function(id, name) {
    _showDeleteConfirmModal(
      `Deseja realmente excluir o item "${name}" do estoque?`,
      async () => {
        try {
          await DataService.deleteInventoryItem(id, currentUser.uid);
          showToast('Item excluído do estoque.', 'success');
          await _renderInventoryTable();
          setTimeout(() => loadDashboard(), 300);
        } catch {
          showToast('Erro ao excluir item.', 'error');
        }
      }
    );
  };

  // Editar apenas o estoque mínimo (atalho rápido do painel de alertas)
  window.editInventoryMinStock = async function(id) {
    const item = _inventoryData.find(i => i.id === id);
    if (!item) { showToast('Item não encontrado.', 'error'); return; }
    const newMin = prompt(
      `Definir quantidade mínima de alerta para "${item.name}":\n\n` +
      `Quantidade atual: ${item.quantity} ${item.unit}\n` +
      `Mínimo atual: ${item.minStock} ${item.unit}\n\n` +
      `Quando a quantidade ficar igual ou abaixo deste valor, um alerta será exibido.`,
      String(item.minStock)
    );
    if (newMin === null) return; // cancelou
    const parsed = parseFloat(newMin);
    if (isNaN(parsed) || parsed < 0) {
      showToast('Valor inválido. Informe um número positivo.', 'error');
      return;
    }
    try {
      await DataService.updateInventoryItem(id, { minStock: parsed }, currentUser.uid);
      showToast(`Mínimo de "${item.name}" atualizado para ${parsed} ${item.unit}.`, 'success');
      await _renderInventoryTable();
      setTimeout(() => loadDashboard(), 300);
    } catch (err) {
      showToast(err.message?.replace('VALIDATION: ', '') || 'Erro ao atualizar.', 'error');
    }
  };


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
