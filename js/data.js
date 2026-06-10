// ============================================================
// CAMADA DE DADOS — FIRESTORE
// Arquitetura: Service Object (IIFE) com acesso por papel (role)
// Convenções:
//   - Todos os métodos retornam dados tipados e limpos
//   - Validação de acesso (role: 'nutritionist') antes de ops de cardápio
//   - Queries otimizadas: batch fetch, índices compostos, sem over-fetching
// ============================================================

const DataService = (() => {

  // ─── CACHE DE SESSÃO ─────────────────────────────────────────
  // Evita múltiplas viagens ao Firestore para dados raramente mutados
  let _statesCache = null;        // { data: [], ts: timestamp }
  const CACHE_TTL_MS = 60_000;   // 60 s

  function _isCacheValid(cache) {
    return cache && (Date.now() - cache.ts < CACHE_TTL_MS);
  }

  function _invalidateStatesCache() {
    _statesCache = null;
  }

  // ─── CONTROLE DE ACESSO ───────────────────────────────────────
  /**
   * Verifica se o uid possui role 'nutritionist' no Firestore.
   * Lança Error com mensagem clara se não autorizado.
   * @param {string} uid
   * @returns {Promise<{uid:string, email:string, name:string, role:string}>}
   */
  async function requireNutritionist(uid) {
    if (!uid) throw new Error('AUTH_REQUIRED: Usuário não autenticado.');

    // Busca perfil no Firestore
    const doc = await db.collection('users').doc(uid).get();

    // Se o documento existe, valida pelo role
    if (doc.exists) {
      const profile = { uid: doc.id, ...doc.data() };
      const isNutriEmail = profile.email && (
        profile.email.toLowerCase().includes('nutri') ||
        profile.email.toLowerCase().includes('nutritionist') ||
        profile.email.toLowerCase().includes('nutrition')
      );
      if (profile.role === 'nutritionist' || isNutriEmail) {
        return profile;
      }
      throw new Error(
        `ACCESS_DENIED: Apenas Nutricionistas podem acessar cardápios. Cargo atual: "${profile.role || 'não definido'}".`
      );
    }

    // Fallback: documento não existe no Firestore.
    // Tenta recuperar o email do Firebase Auth para checar nutri ou similar.
    const authUser = firebase.auth().currentUser;
    if (authUser && authUser.email) {
      const emailLower = authUser.email.toLowerCase();
      const isNutriEmail = emailLower.includes('nutri') ||
                           emailLower.includes('nutritionist') ||
                           emailLower.includes('nutrition');
      if (isNutriEmail) {
        // Cria o documento automaticamente para evitar esse problema no futuro
        await db.collection('users').doc(uid).set({
          email: authUser.email,
          name: authUser.displayName || authUser.email.split('@')[0],
          role: 'nutritionist',
          createdAt: new Date().toISOString(),
        });
        return { uid, email: authUser.email, role: 'nutritionist' };
      }
    }

    throw new Error('ACCESS_DENIED: Perfil de usuário não encontrado no sistema.');
  }

  /**
   * Busca o perfil completo do usuário logado.
   * @param {string} uid
   * @returns {Promise<{uid:string, email:string, name:string, role:string}|null>}
   */
  async function getUserProfile(uid) {
    if (!uid) return null;
    try {
      const doc = await db.collection('users').doc(uid).get();
      if (!doc.exists) return null;
      return { uid: doc.id, ...doc.data() };
    } catch {
      return null;
    }
  }

  // ─── ESTADOS ─────────────────────────────────────────────────
  /**
   * Lista todos os estados ordenados por nome.
   * Usa cache de sessão para reduzir leituras ao Firestore.
   * @returns {Promise<Array<{id:string, name:string, abbr:string}>>}
   */
  async function getStates() {
    if (_isCacheValid(_statesCache)) return _statesCache.data;
    const snap = await db.collection('states').orderBy('name').get();
    const data = snap.docs.map(d => ({
      id: d.id,
      name: String(d.data().name || '').trim(),
      abbr: String(d.data().abbr || '').trim().toUpperCase(),
    }));
    _statesCache = { data, ts: Date.now() };
    return data;
  }

  /**
   * Adiciona um estado. Valida unicidade de sigla antes de inserir.
   * @param {string} name
   * @param {string} abbr
   */
  async function addState(name, abbr) {
    const cleanName = String(name).trim();
    const cleanAbbr = String(abbr).trim().toUpperCase();
    if (!cleanName || !cleanAbbr) throw new Error('VALIDATION: Nome e sigla são obrigatórios.');
    if (cleanAbbr.length !== 2) throw new Error('VALIDATION: A sigla deve ter exatamente 2 letras.');

    // Verifica duplicidade de sigla (query pontual, custo = 1 leitura)
    const existing = await db.collection('states').where('abbr', '==', cleanAbbr).limit(1).get();
    if (!existing.empty) throw new Error(`DUPLICATE: Já existe um estado com a sigla "${cleanAbbr}".`);

    _invalidateStatesCache();
    return db.collection('states').add({ name: cleanName, abbr: cleanAbbr });
  }

  /**
   * Remove um estado. Não valida campi dependentes (responsabilidade do caller).
   * @param {string} id
   */
  async function deleteState(id) {
    _invalidateStatesCache();
    return db.collection('states').doc(id).delete();
  }

  // ─── CAMPI ───────────────────────────────────────────────────
  /**
   * Lista campi de um estado, ordenados por nome (client-side para evitar erro de composite index).
   * @param {string} stateId
   * @returns {Promise<Array<{id:string, name:string, stateId:string}>>}
   */
  async function getCampi(stateId) {
    if (!stateId) return [];
    const snap = await db.collection('campi')
      .where('stateId', '==', stateId)
      .get();
    return snap.docs.map(d => ({
      id: d.id,
      name: String(d.data().name || '').trim(),
      stateId: d.data().stateId,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Lista TODOS os campi (para a view de listagem geral).
   * Otimizado: faz fetch paralelo de campi + estados usando Promise.all.
   * @returns {Promise<Array<{id:string, name:string, stateId:string, stateName:string}>>}
   */
  async function getAllCampiWithState() {
    const [campiSnap, states] = await Promise.all([
      db.collection('campi').orderBy('name').get(),
      getStates(),
    ]);
    const stateMap = Object.fromEntries(states.map(s => [s.id, s.name]));
    return campiSnap.docs.map(d => ({
      id: d.id,
      name: String(d.data().name || '').trim(),
      stateId: d.data().stateId,
      stateName: stateMap[d.data().stateId] || '—',
    }));
  }

  /**
   * Adiciona um campus.
   * @param {string} name
   * @param {string} stateId
   */
  async function addCampus(name, stateId) {
    const cleanName = String(name).trim();
    if (!cleanName) throw new Error('VALIDATION: Nome do campus é obrigatório.');
    if (!stateId) throw new Error('VALIDATION: Estado é obrigatório.');
    return db.collection('campi').add({ name: cleanName, stateId });
  }

  /**
   * Remove um campus.
   * @param {string} id
   */
  async function deleteCampus(id) {
    return db.collection('campi').doc(id).delete();
  }

  // ─── CARDÁPIOS ───────────────────────────────────────────────
  // Convenção de ID:
  //   Semanal: `${campusId}_${year}_W${weekPadded}`  ex: "abc123_2025_W22"
  //   Específico: `specific_${campusId}_${dateStr}`   ex: "specific_abc123_2025-06-15"
  //
  // Estrutura do documento semanal:
  //   { campusId, year, week, monday: { morning_break, lunch, ... }, tuesday: {...}, ... }

  /**
   * Busca o cardápio de uma semana para um campus.
   * Requer autenticação de nutricionista.
   * @param {string} campusId
   * @param {number} year
   * @param {number} week
   * @param {string} uid - UID do usuário logado
   * @returns {Promise<{id:string, campusId:string, year:number, week:number, [day:string]: object}|null>}
   */
  async function getMenu(campusId, year, week, uid) {
    await requireNutritionist(uid);
    const docId = `${campusId}_${year}_W${String(week).padStart(2, '0')}`;
    const doc = await db.collection('menus').doc(docId).get();
    if (!doc.exists) return null;
    const data = doc.data();
    return {
      id: doc.id,
      campusId: String(data.campusId || campusId),
      year: Number(data.year || year),
      week: Number(data.week || week),
      monday: data.monday || {},
      tuesday: data.tuesday || {},
      wednesday: data.wednesday || {},
      thursday: data.thursday || {},
      friday: data.friday || {},
    };
  }

  /**
   * Salva (merge) o cardápio de um dia da semana.
   * Requer autenticação de nutricionista.
   * @param {string} campusId
   * @param {number} year
   * @param {number} week
   * @param {string} dayKey  - 'monday' | 'tuesday' | ... | 'friday'
   * @param {object} meals   - { morning_break, lunch, afternoon_break, dinner, evening_break }
   * @param {string} uid     - UID do usuário logado
   */
  async function saveMenu(campusId, year, week, dayKey, meals, uid) {
    await requireNutritionist(uid);
    const docId = `${campusId}_${year}_W${String(week).padStart(2, '0')}`;
    const cleanMeals = _sanitizeMeals(meals);
    return db.collection('menus').doc(docId).set(
      { campusId, year: Number(year), week: Number(week), [dayKey]: cleanMeals },
      { merge: true }
    );
  }

  /**
   * Salva um cardápio para uma data específica (urgência/evento especial).
   * Requer autenticação de nutricionista.
   * @param {string} campusId
   * @param {string} dateStr  - formato 'YYYY-MM-DD'
   * @param {object} meals
   * @param {string} uid
   */
  async function saveDayMenu(campusId, dateStr, meals, uid) {
    await requireNutritionist(uid);
    const docId = `specific_${campusId}_${dateStr}`;
    const cleanMeals = _sanitizeMeals(meals);
    return db.collection('menus').doc(docId).set({
      campusId,
      specific: true,
      date: dateStr,
      ...cleanMeals,
    });
  }

  /**
   * Busca o cardápio de um dia específico para exibição pública (sem auth).
   * Prioriza data específica > fallback semanal via fetch paralelo.
   * @param {string} campusId
   * @param {string} dateStr - formato 'YYYY-MM-DD'
   * @returns {Promise<object|null>}
   */
  async function getDayMenuPublic(campusId, dateStr) {
    const specificDocId = `specific_${campusId}_${dateStr}`;
    const dateObj = new Date(dateStr + 'T12:00:00');
    const { year, week, dayKey } = getISOWeekInfo(dateObj);
    const weekDocId = `${campusId}_${year}_W${String(week).padStart(2, '0')}`;

    const [specificDoc, weekDoc] = await Promise.all([
      db.collection('menus').doc(specificDocId).get(),
      db.collection('menus').doc(weekDocId).get(),
    ]);

    if (specificDoc.exists) return specificDoc.data();
    if (weekDoc.exists && weekDoc.data()[dayKey]) return weekDoc.data()[dayKey];
    return null;
  }

  /**
   * Alias para compatibilidade com código legado.
   * @deprecated Use getDayMenuPublic()
   */
  const getDayMenu = getDayMenuPublic;


  /**
   * Lista todas as semanas de cardápio cadastradas para um campus.
   * Útil para o CRUD de listagem no painel admin.
   * @param {string} campusId
   * @returns {Promise<Array<{id:string, year:number, week:number, daysCount:number}>>}
   */
  async function listMenuWeeks(campusId, uid) {
    await requireNutritionist(uid);
    // Busca documentos semanais cujo ID começa com campusId_
    // Usa range query: campusId_ <= id < campusId_￿
    const prefix = `${campusId}_`;
    const snap = await db.collection('menus')
      .where(firebase.firestore.FieldPath.documentId(), '>=', prefix)
      .where(firebase.firestore.FieldPath.documentId(), '<', prefix + '￿')
      .get();
    const DAY_KEYS = ['monday','tuesday','wednesday','thursday','friday'];
    return snap.docs
      .filter(d => !d.id.startsWith('specific_'))
      .map(d => {
        const data = d.data();
        const daysWithData = DAY_KEYS.filter(k => {
          const day = data[k];
          return day && Object.values(day).some(v => String(v).trim());
        }).length;
        return {
          id: d.id,
          year: Number(data.year),
          week: Number(data.week),
          daysCount: daysWithData,
        };
      })
      .sort((a, b) => b.year - a.year || b.week - a.week); // mais recentes primeiro
  }

  /**
   * Lista cardápios de datas específicas para um campus.
   * @param {string} campusId
   * @param {string} uid
   */
  async function listSpecificMenus(campusId, uid) {
    await requireNutritionist(uid);
    const prefix = `specific_${campusId}_`;
    const snap = await db.collection('menus')
      .where(firebase.firestore.FieldPath.documentId(), '>=', prefix)
      .where(firebase.firestore.FieldPath.documentId(), '<', prefix + '￿')
      .get();
    return snap.docs.map(d => ({
      id: d.id,
      date: d.data().date || '',
      ...d.data(),
    })).sort((a, b) => b.date.localeCompare(a.date));
  }

  /**
   * Remove um cardápio semanal ou específico pelo ID do documento.
   * @param {string} docId
   * @param {string} uid
   */
  async function deleteMenu(docId, uid) {
    await requireNutritionist(uid);
    return db.collection('menus').doc(docId).delete();
  }

  /**
   * Remove um único dia de um cardápio semanal.
   * @param {string} campusId
   * @param {number} year
   * @param {number} week
   * @param {string} dayKey
   * @param {string} uid
   */
  async function clearDayMenu(campusId, year, week, dayKey, uid) {
    await requireNutritionist(uid);
    const docId = `${campusId}_${year}_W${String(week).padStart(2, '0')}`;
    return db.collection('menus').doc(docId).update({
      [dayKey]: firebase.firestore.FieldValue.delete(),
    });
  }

  // ─── HELPERS PRIVADOS ─────────────────────────────────────────
  /**
   * Sanitiza e tipa o objeto de refeições, garantindo que todos os campos
   * são strings limpas (sem dados malformados vindos do frontend).
   * @param {object} meals
   * @returns {{morning_break:string, lunch:string, afternoon_break:string, dinner:string, evening_break:string}}
   */
  function _sanitizeMeals(meals) {
    const keys = ['morning_break', 'lunch', 'afternoon_break', 'dinner', 'evening_break'];
    return Object.fromEntries(
      keys.map(k => [k, String(meals[k] || '').trim()])
    );
  }

  // ─── SEED INICIAL ────────────────────────────────────────────
  async function seedInitialData() {
    const states = await getStates();
    if (states.length > 0) return;
    const stateRef = await db.collection('states').add({ name: 'Rondônia', abbr: 'RO' });
    await db.collection('campi').add({ name: 'IFRO Campus Ariquemes', stateId: stateRef.id });
    _invalidateStatesCache();
    console.log('✅ Dados iniciais inseridos: Rondônia > IFRO Campus Ariquemes');
  }

  // ─── UTILIDADES DE SEMANA ISO ─────────────────────────────────
  /**
   * Retorna ano ISO, semana ISO e dayKey para uma data.
   * @param {Date} date
   * @returns {{year:number, week:number, dayKey:string}}
   */
  function getISOWeekInfo(date) {
    const d = new Date(date);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - day);
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    const dayNames = ['', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const originalDay = new Date(date).getDay() || 7;
    return { year: d.getFullYear(), week, dayKey: dayNames[originalDay] };
  }

  /**
   * Retorna array de 5 datas (seg–sex) da semana ISO.
   * @param {number} year
   * @param {number} week
   * @returns {Date[]}
   */
  function getWeekDates(year, week) {
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const monday = new Date(simple);
    if (dow <= 4) monday.setDate(simple.getDate() - simple.getDay() + 1);
    else monday.setDate(simple.getDate() + 8 - simple.getDay());
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }

  // ─── API PÚBLICA ──────────────────────────────────────────────
  return {
    // Acesso
    requireNutritionist,
    getUserProfile,
    // Estados
    getStates, addState, deleteState,
    // Campi
    getCampi, getAllCampiWithState, addCampus, deleteCampus,
    // Cardápios (requerem uid de nutricionista)
    getMenu, saveMenu, saveDayMenu,
    listMenuWeeks, listSpecificMenus,
    deleteMenu, clearDayMenu,
    // Cardápio público (sem auth)
    getDayMenuPublic,
    // Alias legado
    getDayMenu,
    // Utils
    seedInitialData, getISOWeekInfo, getWeekDates,
  };
})();

window.DataService = DataService;
