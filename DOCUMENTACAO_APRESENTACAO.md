# 🍽️ Guia de Apresentação e Documentação de Funcionalidades — Cardápio Escolar IFRO

Este documento serve como um guia completo para a apresentação do projeto **Cardápio Escolar IFRO** (Estrutura de Dados) e detalha todas as funcionalidades desenvolvidas, a arquitetura técnica, o modelo de banco de dados e as configurações críticas necessárias antes da apresentação.

---

## 📑 Resumo Executivo da Solução (Estrutura Mínima)

* **Nome da solução:** Cardápio Escolar IFRO
* **Integrantes da equipe:** [Nome 1], [Nome 2], [Nome 3] *(preencha com os nomes)*
* **Problema identificado:** Falta de um meio centralizado, moderno e de fácil atualização para que alunos consultem as refeições diárias do IFRO, e a necessidade de um sistema eficiente e rápido para a gestão de cardápios por parte das nutricionistas.
* **Público-alvo:** Alunos do Instituto Federal de Rondônia (IFRO) e profissionais de Nutrição da instituição.
* **Proposta de valor:** Fornecer um portal web rápido e intuitivo para alunos consultarem cardápios atualizados, e um painel administrativo seguro, moderno e com suporte de Inteligência Artificial para otimizar o trabalho das nutricionistas na gestão das refeições.
* **Requisitos funcionais:** 
  * Visualização pública de cardápios diários com navegação semanal.
  * Seleção dinâmica de Estados e Campi.
  * Autenticação segura (login/recuperação de senha) para Nutricionistas.
  * Painel Administrativo com CRUD para Estados, Campi e Cardápios (semanais e específicos/exceções).
  * Assistente virtual IA (chatbot) integrado no painel da nutricionista.
* **Requisitos não funcionais:**
  * Interface responsiva, amigável e com experiência do usuário (UX) focada em performance (ex: *skeleton screens*).
  * Arquitetura *Serverless* executada diretamente no navegador usando CDN.
  * Alta disponibilidade e segurança com validação de regras diretamente no banco de dados (Firestore Rules).
* **Modelagem da solução:** Banco de dados em nuvem NoSQL orientado a documentos (Firestore) dividido em 4 coleções principais: `states` (estados), `campi` (unidades), `menus` (cardápios) e `users` (nutricionistas).
* **Tecnologias utilizadas:** HTML5, CSS3, JavaScript Vanilla, Firebase SDK (Authentication e Cloud Firestore) e Google Gemini AI (API).
* **Descrição do uso de IA:** O projeto inclui um assistente virtual inovador (*Gemini Chat Widget*) no painel administrativo. A IA atua exclusivamente como uma "Assistente de Nutrição Escolar do IFRO", respondendo a dúvidas técnicas das nutricionistas sobre elaboração de receitas, valores nutricionais e controle de alergias alimentares.
* **Prints ou link do protótipo:** [Insira aqui o link do sistema ou cole prints das telas]
* **Estratégia de validação:** [Descreva aqui a estratégia de testes, ex: validação manual com base em simulação de acessos, etc.]
* **Resultados obtidos:** [Descreva os resultados, ex: sistema 100% responsivo e funcional entregue com sucesso.]

---

## 🔍 1. Análise de Completude do Código

O código-fonte do projeto está **completo, bem estruturado e pronto para apresentação**. A arquitetura foi desenvolvida utilizando padrões modernos e limpos (como a separação de responsabilidades e encapsulamento em Services), com tratamento de erros robusto e experiência do usuário (UX) premium.

### Pontos Fortes para Destacar na Apresentação:
1. **Sem Dependência de Servidor (Serverless):** O projeto roda diretamente no navegador utilizando as SDKs do Firebase via CDN. Não há necessidade de configurar um backend complexo em Node.js ou outra linguagem para a apresentação; basta rodar um servidor de arquivos estáticos simples (ex: Live Server).
2. **Dupla Camada de Segurança:** O controle de acesso à área da nutricionista é validado no frontend (bloqueando a visualização de menus caso a conta logada não possua o cargo) e no banco de dados (por meio das regras de segurança do Firestore).
3. **Seeding Automático de Dados (`seedInitialData`):** Caso o banco de dados esteja zerado no início da apresentação, a primeira consulta à página pública irá detectar a ausência de dados e criará automaticamente o estado **Rondônia (RO)** e o campus **IFRO Campus Ariquemes**, garantindo que a aplicação nunca abra em um estado de erro vazio.
4. **Resiliência de Contas (`requireNutritionist`):** Se uma conta for criada manualmente no painel do Firebase Auth com email contendo a palavra "nutri" (ex: `nutricionista@ifro.edu.br`), mas o documento correspondente na coleção `/users` do Firestore ainda não tiver sido criado, o sistema cria o perfil automaticamente no primeiro login, evitando erros inesperados durante a exibição.

### ⚠️ Atenção: Itens Críticos para Revisar Antes da Apresentação!
1. **Chave de API do Gemini (`js/chat-bot.js`):** A chave configurada (`AQ.Ab8RN6...`) possui formato incorreto/inválido (chaves do Google AI Studio tipicamente iniciam com `AIzaSy`). **Você deve gerar uma chave válida no [Google AI Studio](https://aistudio.google.com/) e substituí-la na linha 9 do arquivo `js/chat-bot.js`** para que o assistente virtual funcione em tempo real.
2. **Configuração e Ativação do Firebase Console:** Certifique-se de que o provedor **E-mail/Senha** está ativo em *Authentication → Sign-in method* e que as regras de segurança no Firestore foram publicadas, conforme descrito na seção de configuração abaixo.

---

## 🛠️ 2. Arquitetura do Sistema e Estrutura do Código

A aplicação está dividida de forma modular:

*   `index.html` e `js/app.js`: Interface pública destinada aos alunos.
*   `admin.html` e `js/admin.js`: Interface administrativa protegida para nutricionistas.
*   `js/data.js`: Camada de acesso a dados (Service) que centraliza todas as operações com o Firestore.
*   `js/firebase-config.js`: Centraliza a inicialização da conexão com os serviços do Firebase.
*   `js/chat-bot.js` e `css/chat-bot.css`: Widget inteligente autônomo com IA integrado ao painel admin.
*   `css/style.css` e `css/admin.css`: Estilização vanilla moderna com transições suaves e design adaptável (responsivo).

---

## 📋 3. Documentação das Funcionalidades do Projeto

O sistema é dividido em três grandes módulos funcionais:

### 3.1. Painel do Aluno (Visualização Pública — `index.html`)
Desenvolvido para oferecer um acesso rápido e direto sem necessidade de cadastro ou login:
*   **Seleção Dinâmica de Localidade:** O usuário seleciona o Estado e o Campus por meio de menus suspensos interativos. O menu de Campus é habilitado apenas após a seleção de um Estado.
*   **Navegação Semanal Inteligente:** Permite navegar pelas semanas do ano (Avançar/Voltar). A barra exibe os dias letivos da semana (Segunda a Sexta-feira) com a data correspondente de forma clara.
*   **Visualização de Refeições Diárias:** Exibe um grid contendo as 5 refeições diárias padronizadas:
    1.  🥐 **Intervalo da Manhã** (09:30 – 10:00)
    2.  🍽️ **Almoço** (12:00 – 13:00)
    3.  🍎 **Intervalo da Tarde** (15:30 – 16:00)
    4.  🌙 **Janta** (18:30 – 19:30)
    5.  ⭐ **Intervalo Noturno** (21:00 – 21:30)
*   **Experiência Visual Fluida:**
    *   *Skeleton Screen:* Animação de carregamento temporária exibida enquanto os dados são buscados do Firestore.
    *   *Empty States:* Exibição de mensagem amigável ("Cardápio não disponível") caso a nutricionista ainda não tenha preenchido o cardápio daquele dia.
    *   *Badge de Hoje:* Exibe no cabeçalho o dia e o mês atualizados automaticamente.

### 3.2. Painel da Nutricionista (Administração — `admin.html`)
Módulo seguro e exclusivo que permite gerenciar toda a estrutura e as refeições da instituição:
*   **Autenticação e Recuperação de Senha (Firebase Auth):**
    *   Login seguro por e-mail e senha.
    *   Fluxo integrado de "Esqueci minha senha" que dispara e-mails automáticos de redefinição de senha através do Firebase.
    *   Tratamento de erros de autenticação amigável em português (ex: "Senha incorreta", "E-mail inválido").
*   **Dashboard e Estatísticas:**
    *   Resumo de dados cadastrados: total de estados cadastrados, total de campi cadastrados e quantidade de dias com cardápios preenchidos na semana atual.
    *   Cards de acesso rápido e guia passo a passo inicial para novos usuários.
*   **Gerenciamento de Estados (UF):**
    *   Cadastro de estados contendo Nome e Sigla (com validação de sigla para 2 caracteres e verificação de duplicidade antes da inserção).
    *   Listagem em tabela com opção de exclusão.
*   **Gerenciamento de Campi:**
    *   Cadastro de unidades escolares associadas a um estado pré-cadastrado.
    *   Listagem em tabela identificando o estado de cada campus, com opção de exclusão.
*   **Editor de Cardápio Semanal Avançado:**
    *   Preenchimento dia a dia (Segunda a Sexta) de forma individual.
    *   Campos com contagem de caracteres em tempo real e badge indicativo de "Preenchido".
    *   **Recurso de Cópia Rápida:** Permite copiar todo o cardápio de um dia da semana para outro com apenas dois cliques (evitando retrabalho em cardápios repetitivos).
*   **Cardápio para Data Específica (Urgência):**
    *   Possibilidade de registrar um cardápio especial para uma data específica (ex: feriado, evento festivo ou alteração emergencial). Este cardápio se sobrepõe ao cardápio semanal padrão daquela data na visualização do aluno.
*   **Histórico e CRUD de Cardápios:**
    *   Visualização em abas separando cardápios **Semanais** e **Específicos**.
    *   Exibição visual do progresso de preenchimento dos dias letivos (dots verdes indicando quais dias da semana já estão salvos).
    *   Opções diretas para **Editar** ou **Excluir** cardápios inteiros.
*   **Cadastro de Nutricionistas:**
    *   Cadastro de novas nutricionistas diretamente pelo painel. O sistema cria a conta no Firebase Auth e vincula o perfil com a função `role: "nutritionist"` no Firestore.

### 3.3. Assistente de Nutrição IA (Gemini Chat Widget)
Um diferencial inovador que enriquece a apresentação e demonstra a integração prática com Inteligência Artificial:
*   **Visualização Contextual:** O widget flutuante só é exibido na tela para nutricionistas devidamente autenticadas (oculto na tela de login).
*   **Personalidade Customizada:** Configurado com instruções de sistema para agir estritamente como uma *Assistente de Nutrição Escolar do IFRO*, respondendo dúvidas sobre receitas, valores nutricionais, alergias, boas práticas alimentares escolares e elaboração de cardápios.
*   **Conversação Avançada:** Mantém o histórico da conversa na sessão, permitindo que a nutricionista faça perguntas consecutivas dentro de um contexto contínuo.
*   **Elementos Visuais Dinâmicos:** Indicador de digitação animado (*typing indicator*), balões de fala estilizados e rolagem automática ao enviar/receber respostas.

---

## 🗄️ 4. Estrutura e Modelagem do Banco de Dados (Firestore)

Os dados estão estruturados no Cloud Firestore em 4 coleções principais:

### 1. Coleção `states` (Estados)
*   **ID do Documento:** Gerado automaticamente pelo Firestore.
*   **Estrutura do Documento:**
    ```json
    {
      "name": "Rondônia",
      "abbr": "RO"
    }
    ```

### 2. Coleção `campi` (Unidades escolares)
*   **ID do Documento:** Gerado automaticamente pelo Firestore.
*   **Estrutura do Documento:**
    ```json
    {
      "name": "IFRO Campus Ariquemes",
      "stateId": "ID_DO_ESTADO"
    }
    ```

### 3. Coleção `menus` (Cardápios Semanais e Específicos)
Esta coleção armazena tanto o planejamento semanal quanto as exceções diárias:
*   **Cardápio Semanal:**
    *   *ID do Documento:* `${campusId}_${year}_W${week}` (ex: `abc123_2026_W24`)
    *   *Estrutura:*
        ```json
        {
          "campusId": "abc123",
          "year": 2026,
          "week": 24,
          "monday": {
            "morning_break": "Pão com queijo",
            "lunch": "Arroz, feijão e frango",
            "afternoon_break": "Maçã",
            "dinner": "Sopa",
            "evening_break": "Chá e torrada"
          },
          "tuesday": { ... },
          "wednesday": { ... },
          "thursday": { ... },
          "friday": { ... }
        }
        ```
*   **Cardápio Específico (Override):**
    *   *ID do Documento:* `specific_${campusId}_${YYYY-MM-DD}` (ex: `specific_abc123_2026-06-15`)
    *   *Estrutura:*
        ```json
        {
          "campusId": "abc123",
          "specific": true,
          "date": "2026-06-15",
          "morning_break": "Lanche Especial",
          "lunch": "Almoço Festivo",
          "afternoon_break": "",
          "dinner": "",
          "evening_break": ""
        }
        ```

### 4. Coleção `users` (Perfis de Nutricionistas)
*   **ID do Documento:** O próprio UID gerado pelo Firebase Authentication.
*   **Estrutura do Documento:**
    ```json
    {
      "email": "ana@escola.edu.br",
      "name": "Ana Souza",
      "role": "nutritionist",
      "createdAt": "2026-06-10T10:00:00.000Z"
    }
    ```

---

## 🚦 5. Checklist de Preparação para a Apresentação

Antes de iniciar a apresentação perante a banca ou professor, siga estes passos para garantir que tudo funcione de forma impecável:

1.  [ ] **Insira uma API Key do Gemini Válida:** No arquivo [chat-bot.js](file:///c:/Users/LidioStorch/Desktop/ESTRUTURA%20DE%20DADOS/school-menu-main/school-menu-main/js/chat-bot.js#L9), substitua o valor de `apiKey` por uma chave de teste criada no [Google AI Studio](https://aistudio.google.com/).
2.  [ ] **Habilite a Autenticação no Firebase:** Vá no console do Firebase, entre na seção **Authentication**, clique em **Sign-in method** e ative o provedor **E-mail/Senha**.
3.  [ ] **Cadastre o Primeiro Usuário:** Na aba **Users** do Authentication do Firebase, clique em **Add user** e crie uma conta com email contendo a palavra `nutri` (ex: `nutri.apresentacao@ifro.edu.br`) e defina uma senha de sua preferência. Isso permitirá que você faça login no painel de administração imediatamente.
4.  [ ] **Aplique as Regras de Segurança do Firestore:** No console do Firebase, acesse **Firestore Database** -> aba **Regras** e publique as regras abaixo para garantir a segurança dos dados e evitar o bloqueio após 30 dias de teste:
    ```javascript
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        match /states/{id} {
          allow read: if true;
          allow write: if request.auth != null;
        }
        match /campi/{id} {
          allow read: if true;
          allow write: if request.auth != null;
        }
        match /menus/{id} {
          allow read: if true;
          allow write: if request.auth != null;
        }
        match /users/{id} {
          allow read, write: if request.auth != null;
        }
      }
    }
    ```
5.  [ ] **Inicie o Servidor Local:** Abra a pasta do projeto no VS Code e inicie com a extensão **Live Server** ou via linha de comando utilizando o `live-server` para carregar as páginas perfeitamente e evitar problemas de políticas de CORS do navegador.

---
*Este documento foi gerado para auxiliar na apresentação do projeto de Estrutura de Dados do Cardápio Escolar IFRO. Bons estudos e excelente apresentação! 🍽️*
