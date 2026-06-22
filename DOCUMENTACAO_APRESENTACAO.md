# 🍽️ Guia de Apresentação e Documentação de Funcionalidades — Cardápio Escolar IFRO

Este documento serve como um guia completo para a apresentação do projeto **Cardápio Escolar IFRO** (Estrutura de Dados) e detalha todas as funcionalidades desenvolvidas, a arquitetura técnica, o modelo de banco de dados e as configurações críticas necessárias antes da apresentação.

---

## 📑 Resumo Executivo da Solução (Estrutura Mínima)

* **Nome da solução:** Cardápio Escolar IFRO
* **Integrantes da equipe:** [Nome 1], [Nome 2], [Nome 3] *(preencha com os nomes)*
* **Problema identificado:** Falta de um meio centralizado, moderno e de fácil atualização para que alunos consultem as refeições diárias do IFRO, e a necessidade de um sistema eficiente e rápido para a gestão de cardápios por parte das nutricionistas.
* **Público-alvo:** Alunos do Instituto Federal de Rondônia (IFRO) e profissionais de Nutrição da instituição.
* **Proposta de valor:** Fornecer um portal web rápido e intuitivo para alunos consultarem cardápios atualizados, e um painel administrativo seguro e moderno para otimizar o trabalho das nutricionistas na gestão das refeições e controle de estoque.
* **Requisitos funcionais:** 
  * Visualização pública de cardápios diários com navegação semanal.
  * Seleção dinâmica de Estados e Campi.
  * Autenticação segura (login/recuperação de senha) para Nutricionistas.
  * Painel Administrativo com CRUD para Estados, Campi e Cardápios (semanais e específicos/exceções).
  * Controle de Estoque de insumos alimentares com alertas de nível baixo/crítico.
  * Termo de consentimento LGPD obrigatório no primeiro acesso.
* **Requisitos não funcionais:**
  * Interface responsiva, amigável e com experiência do usuário (UX) focada em performance (ex: *skeleton screens*).
  * Arquitetura *Serverless* executada diretamente no navegador usando CDN.
  * Alta disponibilidade e segurança com validação de regras diretamente no banco de dados (Firestore Rules).
  * Conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
* **Modelagem da solução:** Banco de dados em nuvem NoSQL orientado a documentos (Firestore) dividido em 5 coleções principais: `states` (estados), `campi` (unidades), `menus` (cardápios), `users` (nutricionistas) e `inventory` (estoque de insumos).
* **Tecnologias utilizadas:** HTML5, CSS3, JavaScript Vanilla e Firebase SDK (Authentication e Cloud Firestore).
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
1. **Configuração e Ativação do Firebase Console:** Certifique-se de que o provedor **E-mail/Senha** está ativo em *Authentication → Sign-in method* e que as regras de segurança no Firestore foram publicadas, conforme descrito na seção de configuração abaixo.

---

## 🛠️ 2. Arquitetura do Sistema e Estrutura do Código

A aplicação está dividida de forma modular:

*   `index.html` e `js/app.js`: Interface pública destinada aos alunos.
*   `admin.html` e `js/admin.js`: Interface administrativa protegida para nutricionistas.
*   `js/data.js`: Camada de acesso a dados (Service) que centraliza todas as operações com o Firestore.
*   `js/firebase-config.js`: Centraliza a inicialização da conexão com os serviços do Firebase.
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
*   **Termo de Consentimento LGPD:**
    *   Modal obrigatório de Política de Privacidade exibido no primeiro acesso, com texto legal e aceite explícito via checkbox.

### 3.4. Controle de Estoque (Módulo `inventory`)
Módulo dedicado ao gerenciamento de insumos alimentares da instituição:
*   **CRUD completo:** Adicionar, editar e excluir itens do estoque com nome, categoria, unidade, quantidade atual e estoque mínimo.
*   **Categorias padronizadas:** Grãos e Cereais, Proteínas, Laticínios, Hortifrúti, Temperos e Condimentos, Bebidas, Outros.
*   **Classificação automática:** Status `Normal`, `Baixo` ou `Crítico` calculado automaticamente com base na quantidade atual vs. estoque mínimo.
*   **Painel de alertas:** Notificação visual dos itens com estoque baixo ou crítico, funcionando como aviso simples sem botões de edição.
*   **Filtros avançados:** Busca textual por nome, filtro por categoria e filtro por status.
*   **Cards de estatísticas:** Total de itens, quantidade em estoque baixo e em estoque crítico.


---

## 🗄️ 4. Estrutura e Modelagem do Banco de Dados (Firestore)

Os dados estão estruturados no Cloud Firestore em 5 coleções principais:

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

### 5. Coleção `inventory` (Estoque de Insumos)
*   **ID do Documento:** Gerado automaticamente pelo Firestore.
*   **Estrutura do Documento:**
    ```json
    {
      "name": "Arroz Tipo 1",
      "category": "graos",
      "quantity": 50,
      "unit": "kg",
      "minStock": 20,
      "createdAt": "2026-06-15T10:00:00.000Z",
      "updatedAt": "2026-06-18T14:30:00.000Z"
    }
    ```
*   **Categorias válidas:** `graos`, `proteinas`, `laticinios`, `hortifruti`, `temperos`, `bebidas`, `outros`.
*   **Unidades válidas:** `kg`, `g`, `L`, `mL`, `un`, `pct`, `cx`, `lata`.

---

## 🚦 5. Checklist de Preparação para a Apresentação

Antes de iniciar a apresentação perante a banca ou professor, siga estes passos para garantir que tudo funcione de forma impecável:

1.  [ ] **Habilite a Autenticação no Firebase:** Vá no console do Firebase, entre na seção **Authentication**, clique em **Sign-in method** e ative o provedor **E-mail/Senha**.
2.  [ ] **Cadastre o Primeiro Usuário:** Na aba **Users** do Authentication do Firebase, clique em **Add user** e crie uma conta com email contendo a palavra `nutri` (ex: `nutri.apresentacao@ifro.edu.br`) e defina uma senha de sua preferência. Isso permitirá que você faça login no painel de administração imediatamente.
3.  [ ] **Aplique as Regras de Segurança do Firestore:** No console do Firebase, acesse **Firestore Database** -> aba **Regras** e publique as regras abaixo para garantir a segurança dos dados e evitar o bloqueio após 30 dias de teste:
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
        match /inventory/{id} {
          allow read, write: if request.auth != null;
        }
      }
    }
    ```
4.  [ ] **Inicie o Servidor Local:** Abra a pasta do projeto no VS Code e inicie com a extensão **Live Server** ou via linha de comando utilizando o `live-server` para carregar as páginas perfeitamente e evitar problemas de políticas de CORS do navegador.

---

## 📝 6. Resumo das Alterações Realizadas

Abaixo está o histórico de modificações feitas no projeto desde a versão original, organizadas por módulo:

### 6.1. Novo Módulo: Controle de Estoque (`inventory`)
*   **Aba dedicada no Painel Admin:** Nova seção "Estoque" no menu lateral, com ícone e navegação integrada.
*   **CRUD completo de itens:** Adicionar, editar e excluir insumos alimentares (ex: arroz, feijão, leite). Cada item possui:
    *   Nome, Categoria (Grãos e Cereais, Proteínas, Laticínios, Hortifrúti, Temperos, Bebidas, Outros), Unidade de medida (kg, g, L, mL, un, pct, cx, lata), Quantidade atual e Estoque mínimo.
*   **Classificação automática de status:** Cada item é classificado como `Normal`, `Baixo` (quantidade ≤ mínimo) ou `Crítico` (quantidade = 0), com badges coloridos.
*   **Painel de alertas "Itens para Acabar":** Exibido automaticamente quando existem itens com estoque baixo ou crítico. Mostra nome, categoria, barra de progresso visual e valores atuais vs. mínimos. **Os botões de edição foram removidos deste painel para que funcione exclusivamente como aviso simples de notificação à nutricionista.**
*   **Filtros avançados:** Busca por nome, filtro por categoria e filtro por status do estoque.
*   **Stats cards:** Exibe total de itens, quantidade em estoque baixo e quantidade em estoque crítico.
*   **Coleção Firestore:** Nova coleção `inventory` com estrutura:
    ```json
    {
      "name": "Arroz Tipo 1",
      "category": "graos",
      "quantity": 50,
      "unit": "kg",
      "minStock": 20,
      "createdAt": "2026-06-15T10:00:00.000Z",
      "updatedAt": "2026-06-18T14:30:00.000Z"
    }
    ```

### 6.2. Dashboard Aprimorado
*   **Novo stat card "Itens no Estoque":** Exibe a contagem total de itens cadastrados no estoque diretamente no Dashboard.
*   **Card de Alertas de Estoque no Dashboard:** Um card de alerta é exibido no Dashboard quando há itens com estoque baixo ou crítico, permitindo que a nutricionista veja os avisos sem precisar navegar até a aba de Estoque.
*   **Acesso Rápido expandido:** Novo botão "Controle de Estoque" no grid de acesso rápido do Dashboard.

### 6.3. Conformidade LGPD
*   **Modal de Termo de Consentimento:** Implementado modal obrigatório de Política de Privacidade e LGPD (Lei nº 13.709/2018), exibido no primeiro acesso da nutricionista. O aceite é obrigatório (checkbox + botão "Aceitar e Continuar"), impedindo o uso do sistema sem consentimento explícito.
*   **Conteúdo do termo:** Inclui seções sobre Dados Coletados, Finalidade, Base Legal, Direitos do Titular, Segurança e Retenção de dados.

### 6.4. Melhorias de UX no Editor de Cardápios
*   **Modal de confirmação de cópia:** Ao usar o recurso "Copiar Rápido" para sobrescrever um dia já preenchido, um modal de confirmação é exibido antes de sobrescrever os dados.
*   **Modal de confirmação de exclusão:** Ao excluir cardápios (semanais ou específicos), um modal de confirmação é exibido, evitando exclusões acidentais.
*   **Toast com botão "Desfazer":** Após copiar refeições de um dia para outro, um toast com botão de desfazer (ativo por 10 segundos) permite reverter a operação imediatamente (princípio de Controle e Liberdade do Usuário — Nielsen #3).

### 6.5. Alterações Pontuais
*   **Painel de Alertas de Estoque (aba Estoque):** Removidos os botões "Mín." e "Editar" do painel de alertas de itens para acabar. O painel agora funciona apenas como aviso simples de notificação, sem ações inline. A edição dos itens continua disponível pela tabela principal do estoque.
*   **Regras de segurança do Firestore:** Devem incluir a nova coleção `inventory`:
    ```javascript
    match /inventory/{id} {
      allow read, write: if request.auth != null;
    }
    ```

---
*Este documento foi gerado para auxiliar na apresentação do projeto de Estrutura de Dados do Cardápio Escolar IFRO. Bons estudos e excelente apresentação! 🍽️*

