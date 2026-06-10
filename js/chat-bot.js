// ============================================================
// GEMINI CHAT WIDGET — Widget Autocontido
// Injeta HTML dinamicamente e gerencia conversação com a API
// do Google Gemini (Generative Language).
//
// ⚠️  IMPORTANTE — API KEY:
//     Gere sua chave gratuita em: https://aistudio.google.com/app/apikey
//     Cole-a abaixo substituindo o placeholder.
//     NUNCA exponha esta chave em repositórios públicos.
// ============================================================

const GEMINI_CONFIG = {
    apiKey: "AQ.Ab8RN6L_tLh3co1qe6H1o_0xfyPnomuWf0tfqE5KwA7uuzgaLw",

    // Modelo será descoberto automaticamente via ListModels (ver _discoverBestModel)
    // Ordem de preferência: melhor qualidade primeiro
    modelPreferences: [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-2.0-flash-001',
        'gemini-2.0-flash-lite',
        'gemini-2.0-flash-lite-001',
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash-001',
        'gemini-1.5-pro',
        'gemini-1.5-pro-latest',
        'gemini-pro',
        'gemini-1.0-pro',
    ],

    // Versões da API a tentar (em ordem) — v1beta tem mais modelos disponíveis
    apiVersions: ['v1beta', 'v1'],

    // Base do system prompt — será enriquecido com dados reais do Firestore
    systemInstructionBase: `Você é uma assistente de nutrição escolar do IFRO (Instituto Federal de Rondônia).
Seu papel é ajudar nutricionistas a tirar dúvidas sobre cardápios, receitas, valores nutricionais, alimentos e boas práticas de alimentação saudável nas escolas.
Responda SEMPRE em português do Brasil, de forma clara, amigável e profissional.
Se a pergunta não for relacionada à nutrição ou alimentação escolar, informe educadamente que só pode ajudar nesses temas.
Quando sugerir alterações no cardápio, baseie-se EXCLUSIVAMENTE nos alimentos e pratos já cadastrados descritos abaixo.`
};

class GeminiChatWidget {
    constructor() {
        this.chatHistory = [];    // histórico enviado à API (sem system prompt)
        this.isOpen = false;
        this.menuContext = null;
        this.contextLoaded = false;
        this.activeModel = null;
        this.activeVersion = null;
        this.welcomeMessage = "Olá! Sou a assistente de nutrição do IFRO. Como posso ajudar você hoje? 🥗";

        // Chave de localStorage vinculada ao usuário (definida após login)
        this._storageKey = 'ifro_chat_history_default';
    }

    // Define a chave do localStorage por usuário (chamado pelo admin.js após login)
    setUserStorageKey(uid) {
        this._storageKey = `ifro_chat_history_${uid}`;
    }

    init() {
        this.injectHTML();
        this.cacheDOM();
        this.bindEvents();
        this._restoreHistory(); // Carrega histórico salvo antes de exibir boas-vindas
        this._discoverBestModel();
    }

    // ──────────────────────────────────────────────────────────
    // AUTO-DESCOBERTA DE MODELO
    // Chama ListModels para saber exatamente quais modelos estão
    // habilitados para esta chave, sem precisar adivinhar.
    // ──────────────────────────────────────────────────────────
    async _discoverBestModel() {
        for (const version of GEMINI_CONFIG.apiVersions) {
            try {
                const res = await fetch(
                    `https://generativelanguage.googleapis.com/${version}/models`,
                    { headers: { 'x-goog-api-key': GEMINI_CONFIG.apiKey } }
                );
                if (!res.ok) continue;

                const data = await res.json();
                const available = (data.models || [])
                    .filter(m => Array.isArray(m.supportedGenerationMethods)
                        && m.supportedGenerationMethods.includes('generateContent'))
                    .map(m => m.name.replace('models/', ''));

                console.log(`[ChatBot] Modelos disponíveis (${version}):`, available);

                // Escolhe o primeiro da lista de preferência que esteja disponível
                for (const pref of GEMINI_CONFIG.modelPreferences) {
                    if (available.includes(pref)) {
                        this.activeModel = pref;
                        this.activeVersion = version;
                        console.log(`[ChatBot] Modelo selecionado: ${pref} (${version})`);
                        this._updateStatusLabel();
                        return;
                    }
                }

                // Nenhuma preferência encontrada: usa o primeiro disponível
                if (available.length > 0) {
                    this.activeModel = available[0];
                    this.activeVersion = version;
                    console.log(`[ChatBot] Fallback para: ${available[0]} (${version})`);
                    this._updateStatusLabel();
                    return;
                }
            } catch (e) {
                console.warn(`[ChatBot] ListModels falhou para ${version}:`, e);
            }
        }
        console.error('[ChatBot] Nenhum modelo disponível encontrado para esta chave.');
    }

    show() {
        if (this.widgetContainer) {
            this.widgetContainer.style.display = 'block';
            // Ao mostrar o widget, já carrega o contexto em background
            if (!this.contextLoaded) this._loadMenuContext();
        }
    }

    hide() {
        if (this.widgetContainer) {
            this.widgetContainer.style.display = 'none';
        }
    }

    // ──────────────────────────────────────────────────────────
    // CONTEXTO DO FIRESTORE
    // Lê a coleção 'menus' e formata os pratos cadastrados
    // na semana atual para enriquecer o system prompt da IA.
    // ──────────────────────────────────────────────────────────
    async _loadMenuContext() {
        this.contextLoaded = true;
        try {
            const db = window.firebaseApp?.db;
            if (!db) return; // Fora do painel admin, Firebase pode não estar disponível

            const { year, week } = DataService.getISOWeekInfo(new Date());

            // Busca todos os documentos semanais para a semana atual
            const snap = await db.collection('menus')
                .where('year', '==', year)
                .where('week', '==', week)
                .get();

            if (snap.empty) {
                this.menuContext = null;
                return;
            }

            const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
            const DAY_LABELS = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];
            const MEAL_LABELS = {
                morning_break: 'Intervalo da Manhã',
                lunch: 'Almoço',
                afternoon_break: 'Intervalo da Tarde',
                dinner: 'Janta',
                evening_break: 'Intervalo Noturno',
            };

            let contextLines = [`CARDÁPIO CADASTRADO (Ano ${year}, Semana ${week}):`];

            snap.docs.forEach(docSnap => {
                if (docSnap.id.startsWith('specific_')) return; // Ignora específicos nesta iteração
                const data = docSnap.data();

                DAY_KEYS.forEach((dayKey, i) => {
                    const dayData = data[dayKey];
                    if (!dayData) return;

                    const mealLines = Object.entries(dayData)
                        .filter(([, v]) => v && String(v).trim())
                        .map(([k, v]) => `    • ${MEAL_LABELS[k] || k}: ${String(v).trim()}`);

                    if (mealLines.length) {
                        contextLines.push(`\n${DAY_LABELS[i]}:`);
                        contextLines.push(...mealLines);
                    }
                });
            });

            // Busca também datas específicas desta semana (urgências/eventos)
            const weekDates = DataService.getWeekDates(year, week);
            if (weekDates.length) {
                const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                for (const doc of snap.docs) {
                    if (!doc.id.startsWith('specific_')) continue;
                    const d = doc.data();
                    if (d.date) {
                        const mealLines = ['morning_break', 'lunch', 'afternoon_break', 'dinner', 'evening_break']
                            .filter(k => d[k] && String(d[k]).trim())
                            .map(k => `    • ${MEAL_LABELS[k]}: ${String(d[k]).trim()}`);
                        if (mealLines.length) {
                            contextLines.push(`\nData Especial (${d.date}):`);
                            contextLines.push(...mealLines);
                        }
                    }
                }
            }

            this.menuContext = contextLines.join('\n');
        } catch (err) {
            console.warn('[ChatBot] Não foi possível carregar contexto do cardápio:', err);
            this.menuContext = null;
        }
    }

    // Monta o system prompt final, enriquecido com o contexto do cardápio
    _buildSystemInstruction() {
        let instruction = GEMINI_CONFIG.systemInstructionBase;
        if (this.menuContext) {
            instruction += `\n\n${this.menuContext}`;
        } else {
            instruction += `\n\nObs: Não há cardápio cadastrado para a semana atual. Você pode ajudar com dúvidas gerais sobre nutrição escolar.`;
        }
        return instruction;
    }

    // ──────────────────────────────────────────────────────────
    // HISTÓRICO PERSISTENTE — localStorage
    // Salva/carrega até 50 mensagens para retomar a conversa
    // exatamente onde parou, sem depender de Firestore.
    // ──────────────────────────────────────────────────────────

    /** Salva histórico de exibição (não o histórico da API) no localStorage. */
    _saveHistory(sender, text) {
        try {
            const stored = JSON.parse(localStorage.getItem(this._storageKey) || '[]');
            stored.push({ sender, text, ts: Date.now() });
            // Mantém apenas as últimas 50 mensagens
            const trimmed = stored.slice(-50);
            localStorage.setItem(this._storageKey, JSON.stringify(trimmed));
        } catch (e) {
            console.warn('[ChatBot] Não foi possível salvar histórico:', e);
        }
    }

    /** Restaura as mensagens do localStorage ao abrir o widget. */
    _restoreHistory() {
        try {
            const stored = JSON.parse(localStorage.getItem(this._storageKey) || '[]');
            if (!stored.length) {
                // Primeira vez: exibe mensagem de boas-vindas
                this.addMessage('model', this.welcomeMessage, false);
                return;
            }

            // Exibe separador de sessão anterior
            this._addDateSeparator('Sessão anterior');

            stored.forEach(({ sender, text, ts }) => {
                this.addMessage(sender, text, false); // false = não salva de novo no storage
            });

            // Separa a sessão atual
            const now = new Date();
            const label = now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
            this._addDateSeparator(`Hoje • ${label}`);

            // Reconstrói o chatHistory da API a partir do armazenado
            // (somente mensagens user/model para manter o contexto da IA)
            this.chatHistory = stored
                .filter(m => m.sender === 'user' || m.sender === 'model')
                .map(m => ({ role: m.sender, parts: [{ text: m.text }] }));

        } catch (e) {
            console.warn('[ChatBot] Não foi possível restaurar histórico:', e);
            this.addMessage('model', this.welcomeMessage, false);
        }
    }

    /** Remove o histórico do localStorage e limpa a área de mensagens. */
    _clearHistory() {
        if (!confirm('Limpar todo o histórico desta conversa?')) return;
        try {
            localStorage.removeItem(this._storageKey);
        } catch (e) { /* silencioso */ }
        this.chatHistory = [];
        this.messagesContainer.innerHTML = '';
        this.addMessage('model', 'Histórico limpo! Como posso ajudar você hoje? 🥗', false);
    }

    /** Insere um separador visual de data/sessão. */
    _addDateSeparator(label) {
        const sep = document.createElement('div');
        sep.className = 'gemini-chat-date-separator';
        sep.textContent = label;
        this.messagesContainer.appendChild(sep);
    }

    // ──────────────────────────────────────────────────────────
    // HTML DO WIDGET
    // ──────────────────────────────────────────────────────────
    injectHTML() {
        // Prompts rápidos predefinidos
        const CHIPS = [
            { icon: '📅', text: 'Dias da semana com cardápios repetidos.' },
            { icon: '🍽️', text: 'Quais refeições mais são servidas diariamente na semana?' },
            { icon: '🥦', text: 'Sugira uma variação nutricional para o almoço.' },
            { icon: '📈', text: 'Quais alimentos têm maior valor proteíco no cardápio?' },
            { icon: '⚠️', text: 'Há algum dia sem cardápio cadastrado nesta semana?' },
        ];

        const chipsHTML = CHIPS.map(c =>
            `<button class="gemini-chat-chip" aria-label="Enviar: ${c.text}">
                <span class="gemini-chat-chip-icon">${c.icon}</span>${c.text}
            </button>`
        ).join('');

        const widgetHTML = `
            <div class="gemini-chat-widget" id="geminiChatWidget">
                <button class="gemini-chat-trigger" id="geminiChatTrigger"
                    title="Falar com IA de Nutrição" aria-label="Abrir assistente de nutrição">
                    <svg viewBox="0 0 24 24">
                        <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
                    </svg>
                </button>

                <div class="gemini-chat-window" id="geminiChatWindow" role="dialog"
                    aria-label="Assistente de Nutrição IA">

                    <!-- Cabeçalho -->
                    <div class="gemini-chat-header">
                        <div style="display:flex;align-items:center;gap:10px;min-width:0">
                            <div style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0">🥗</div>
                            <div style="min-width:0">
                                <div style="font-weight:700;font-size:0.9rem;white-space:nowrap">Assistente de Nutrição IA</div>
                                <div id="geminiChatStatus" style="font-size:0.7rem;opacity:0.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Inicializando...</div>
                            </div>
                        </div>
                        <div class="gemini-chat-header-actions">
                            <button class="gemini-chat-clear-btn" id="geminiChatClearBtn"
                                title="Limpar histórico de conversa" aria-label="Limpar histórico">
                                <svg viewBox="0 0 24 24">
                                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                </svg>
                                Limpar
                            </button>
                            <button class="gemini-chat-close-btn" id="geminiChatCloseBtn" aria-label="Fechar chat">&times;</button>
                        </div>
                    </div>

                    <!-- Mensagens -->
                    <div class="gemini-chat-messages" id="geminiChatMessages"
                        role="log" aria-live="polite" aria-label="Mensagens do chat"></div>

                    <!-- Dropdown de Sugestão Rápida -->
                    <div class="gemini-chat-chips-dropdown" id="geminiChatChips">
                        <div class="gemini-chat-chips-dropdown-header">
                            <span>Sugestões rápidas</span>
                            <button id="geminiChatChipsClose" aria-label="Fechar sugestões">&times;</button>
                        </div>
                        <div class="gemini-chat-chips-list" role="list">
                            ${chipsHTML}
                        </div>
                    </div>

                    <!-- Campo de entrada -->
                    <div class="gemini-chat-footer">
                        <button class="gemini-chat-suggestions-trigger" id="geminiChatSuggestionsTrigger" title="Sugestões" aria-label="Abrir sugestões">
                            <svg viewBox="0 0 24 24">
                                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2ZM12 5.5L10.5 10.5L5.5 12L10.5 13.5L12 18.5L13.5 13.5L18.5 12L13.5 10.5L12 5.5Z"/>
                            </svg>
                        </button>
                        <input type="text" class="gemini-chat-input" id="geminiChatInput"
                            placeholder="Pergunte sobre o cardápio..." autocomplete="off"
                            aria-label="Campo de mensagem">
                        <button class="gemini-chat-send-btn" id="geminiChatSendBtn" aria-label="Enviar mensagem">
                            <svg viewBox="0 0 24 24">
                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', widgetHTML);
    }

    cacheDOM() {
        this.widgetContainer = document.getElementById('geminiChatWidget');
        this.triggerBtn = document.getElementById('geminiChatTrigger');
        this.chatWindow = document.getElementById('geminiChatWindow');
        this.closeBtn = document.getElementById('geminiChatCloseBtn');
        this.clearBtn = document.getElementById('geminiChatClearBtn');
        this.messagesContainer = document.getElementById('geminiChatMessages');
        this.chipsDropdown = document.getElementById('geminiChatChips');
        this.chipsCloseBtn = document.getElementById('geminiChatChipsClose');
        this.chipsTriggerBtn = document.getElementById('geminiChatSuggestionsTrigger');
        this.inputField = document.getElementById('geminiChatInput');
        this.sendBtn = document.getElementById('geminiChatSendBtn');
        this.statusEl = document.getElementById('geminiChatStatus');
    }

    bindEvents() {
        this.triggerBtn.addEventListener('click', () => this.toggleChat());
        this.closeBtn.addEventListener('click', () => this.toggleChat());
        this.clearBtn.addEventListener('click', () => this._clearHistory());

        this.sendBtn.addEventListener('click', () => this.handleUserMessage());
        this.inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleUserMessage();
            }
        });

        // Chips dropdown toggle
        if (this.chipsTriggerBtn) {
            this.chipsTriggerBtn.addEventListener('click', () => {
                this.chipsDropdown.classList.toggle('open');
            });
        }
        if (this.chipsCloseBtn) {
            this.chipsCloseBtn.addEventListener('click', () => {
                this.chipsDropdown.classList.remove('open');
            });
        }

        // Chips: clique preenche o input E envia imediatamente
        const chips = document.querySelectorAll('.gemini-chat-chip');
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                const text = chip.textContent.trim();
                this.inputField.value = text;
                this.handleUserMessage();
                // Oculta o dropdown após o clique
                if (this.chipsDropdown) {
                    this.chipsDropdown.classList.remove('open');
                }
            });
        });
    }

    toggleChat() {
        this.isOpen = !this.isOpen;
        if (this.isOpen) {
            this.chatWindow.classList.add('gemini-chat-active');
            this.inputField.focus();
            // Atualiza status enquanto carrega contexto
            this._updateStatusLabel();
        } else {
            this.chatWindow.classList.remove('gemini-chat-active');
        }
    }

    _updateStatusLabel() {
        if (!this.statusEl) return;
        if (!this.contextLoaded && !this.activeModel) {
            this.statusEl.textContent = 'Inicializando...';
        } else if (this.activeModel && this.menuContext) {
            this.statusEl.textContent = `Cardápio carregado ✓ • ${this.activeModel}`;
        } else if (this.activeModel) {
            this.statusEl.textContent = `Pronto • ${this.activeModel}`;
        } else {
            this.statusEl.textContent = 'Carregando...';
        }
    }

    // ──────────────────────────────────────────────────────────
    // FLUXO DE MENSAGEM
    // ──────────────────────────────────────────────────────────
    async handleUserMessage() {
        const text = this.inputField.value.trim();
        if (!text) return;

        if (!GEMINI_CONFIG.apiKey || GEMINI_CONFIG.apiKey === 'COLE_SUA_API_KEY_AQUI') {
            this.addMessage('model', '⚠️ A integração com a IA ainda não está configurada. Por favor, insira uma API Key válida do Google AI Studio no arquivo js/chat-bot.js.');
            return;
        }

        this.inputField.value = '';
        this.setInputState(false);
        this.addMessage('user', text);

        if (!this.contextLoaded) {
            await this._loadMenuContext();
            this._updateStatusLabel();
        }

        const typingIndicator = this.addTypingIndicator();

        try {
            const botResponse = await this.sendMessageToGemini(text);
            this.removeTypingIndicator(typingIndicator);
            this.addMessage('model', botResponse);
        } catch (error) {
            console.error('[ChatBot] Erro ao chamar o Gemini:', error);
            this.removeTypingIndicator(typingIndicator);

            let msg;
            if (error.message?.startsWith('QUOTA_429:')) {
                const sec = error.message.split(':')[1];
                msg = `⏳ Cota gratuita esgotada. Tente novamente em **${sec} segundos**.\nSe isso ocorrer com frequência, habilite o plano pago no Google AI Studio.`;
            } else if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('401')) {
                msg = '❌ API Key inválida. Verifique a chave no arquivo chat-bot.js.';
            } else {
                msg = `❌ Erro: ${error.message || 'Tente novamente.'}`;
            }
            this.addMessage('model', msg);
        } finally {
            this.setInputState(true);
        }
    }

    // ──────────────────────────────────────────────────────────
    // CHAMADA À API GEMINI
    // Envia histórico + system prompt enriquecido
    // ──────────────────────────────────────────────────────────
    async sendMessageToGemini(userText) {
        this.chatHistory.push({
            role: "user",
            parts: [{ text: userText }]
        });

        if (!this.activeModel) {
            // Modelo ainda não descoberto: aguarda até 2s antes de desistir
            await new Promise(r => setTimeout(r, 2000));
            if (!this.activeModel) {
                throw new Error('Nenhum modelo Gemini disponível para esta chave. Verifique sua API Key no Google AI Studio.');
            }
        }

        // ── Técnica de injeção de contexto universal ──────────────
        // O campo "system_instruction" não existe em modelos v1 mais antigos
        // (ex: gemini-pro). A forma compatível com TODOS os modelos é injetar
        // as instruções como os dois primeiros turnos do histórico:
        //   [user: "instruções", model: "Entendido!"]
        // Isso preserva o comportamento de sistema sem depender de campos
        // específicos do modelo.
        const systemText = this._buildSystemInstruction();
        const contents = [
            { role: 'user', parts: [{ text: systemText }] },
            { role: 'model', parts: [{ text: 'Entendido! Seguirei essas diretrizes para ajudá-la.' }] },
            ...this.chatHistory
        ];

        const requestBody = {
            contents,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1024,
            }
        };

        const url = `https://generativelanguage.googleapis.com/${this.activeVersion}/models/${this.activeModel}:generateContent`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': GEMINI_CONFIG.apiKey
            },
            body: JSON.stringify(requestBody)
        });


        // Tratamento detalhado de erros HTTP
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const apiMsg = errData?.error?.message || response.statusText;
            const status = response.status;
            console.error("[ChatBot] Erro da API Gemini:", errData);

            // Erro de cota (429): extrai o tempo de espera e informa ao usuário
            if (status === 429) {
                const retryMatch = apiMsg.match(/(\d+\.?\d*)s/);
                const waitSec = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : 60;
                throw new Error(`QUOTA_429:${waitSec}`);
            }

            throw new Error(`Erro ${status}: ${apiMsg}`);
        }

        const data = await response.json();

        // Extrai o texto da resposta conforme estrutura padrão Gemini
        const candidate = data?.candidates?.[0];
        if (candidate?.content?.parts?.[0]?.text) {
            const botText = candidate.content.parts[0].text;
            this.chatHistory.push({
                role: "model",
                parts: [{ text: botText }]
            });
            return botText;
        }

        // Verifica se a resposta foi bloqueada por filtros de segurança
        if (candidate?.finishReason === 'SAFETY') {
            throw new Error('A resposta foi bloqueada por filtros de segurança.');
        }

        console.error("[ChatBot] Resposta inesperada:", JSON.stringify(data));
        throw new Error("Formato de resposta inesperado do Gemini.");
    }

    // ──────────────────────────────────────────────────────────
    // RENDERIZAÇÃO DE MENSAGENS
    // ──────────────────────────────────────────────────────────
    /**
     * @param {string}  sender  - 'user' ou 'model'
     * @param {string}  text    - conteúdo da mensagem
     * @param {boolean} persist - se deve salvar no localStorage (default: true)
     */
    addMessage(sender, text, persist = true) {
        const bubble = document.createElement('div');
        bubble.classList.add('gemini-chat-bubble', `gemini-chat-bubble-${sender === 'user' ? 'user' : 'bot'}`);

        // Converte markdown simples para HTML seguro
        const formatted = String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');

        bubble.innerHTML = formatted;
        this.messagesContainer.appendChild(bubble);
        this.scrollToBottom();

        // Persiste no localStorage (apenas mensagens da conversa real)
        if (persist && (sender === 'user' || sender === 'model')) {
            this._saveHistory(sender, text);
        }
    }

    addTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.classList.add('gemini-chat-bubble', 'gemini-chat-bubble-bot', 'gemini-chat-typing');
        indicator.setAttribute('aria-label', 'A assistente está digitando...');
        indicator.innerHTML = '<span></span><span></span><span></span>';
        this.messagesContainer.appendChild(indicator);
        this.scrollToBottom();
        return indicator;
    }

    removeTypingIndicator(el) {
        if (el?.parentNode) el.parentNode.removeChild(el);
    }

    setInputState(enabled) {
        this.sendBtn.disabled = !enabled;
        this.inputField.disabled = !enabled;
        if (enabled) this.inputField.focus();
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
}

// Inicializa o widget assim que o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    window.geminiChatWidget = new GeminiChatWidget();
    window.geminiChatWidget.init();
    // Visibilidade controlada pelo admin.js após autenticação bem-sucedida
});
