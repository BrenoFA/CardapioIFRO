# 📋 Relatório de Funcionalidades — Cardápio Escolar Integrado IFRO

Este documento apresenta todas as funcionalidades implementadas no sistema de **Cardápio Escolar** para o **IFRO - Campus Ariquemes**, divididas entre a área pública (aluno) e a área administrativa (nutricionista), além da infraestrutura de segurança e dados.

Desenvolvedores: Breno Amorim, Geovane Alencar, Fernando Gabriel, Matheus Pereira
Pitch: https://drive.google.com/file/d/1PzB1zX3vmxsWKjRMSvAyiiNrgjgnIh81/view?usp=sharing
---

## 🍽️ 1. Área Pública (Interface do Aluno / Usuário Comum)

Esta interface é acessada pelo arquivo `index.html` e foi projetada para ser simples, rápida e sem necessidade de login.

* **Filtro por Localidade (Estado e Campus):**
  * Seleção dinâmica do Estado e do Campus correspondente.
  * Carregamento assíncrono das opções diretamente do banco de dados Firestore.
  * Bloqueio inteligente (desabilitação) do campo de Campus até que um Estado seja selecionado.

* **Navegação Semanal por Datas (Calendário Dinâmico):**
  * Visualização do intervalo da semana atual (ex: 08 Jun – 12 Jun 2026).
  * Botões de navegação para avançar (`›`) ou retroceder (`‹`) semanas.
  * Faixa horizontal de dias úteis (Segunda a Sexta) mostrando o dia da semana abreviado e a data numérica.
  * Identificação visual e automática do dia de hoje (marcação especial) e do dia atualmente selecionado.

* **Exibição Detalhada do Cardápio Diário:**
  * Divisão clara em 5 refeições padronizadas pelo setor de nutrição:
    1. 🥐 **Intervalo da Manhã** (Lanche — 09:30 às 10:00)
    2. 🍽️ **Almoço** (Refeição Principal — 12:00 às 13:00)
    3. 🍎 **Intervalo da Tarde** (Lanche — 15:30 às 16:00)
    4. 🌙 **Janta** (Refeição Principal — 18:30 às 19:30)
    5. ⭐ **Intervalo Noturno** (Lanche — 21:00 às 21:30)
  * Visualização de cards informativos para cada refeição com ícone, tipo de prato, horário e descrição dos alimentos.

* **Tratamento de Estado Vazio (Feedback Visual):**
  * Exibição de uma tela ilustrativa amigável ("Cardápio não disponível") caso a nutricionista ainda não tenha cadastrado os dados para a data pesquisada.

* **Efeito de Skeleton Loading (Carregamento Fluido):**
  * Exibição de blocos animados simulando o layout dos cards enquanto a aplicação busca as informações no banco, evitando telas em branco ou travamentos visuais.

---

## 🔒 2. Área Administrativa (Painel da Nutricionista)

Esta interface é acessada pelo arquivo `admin.html` e destina-se exclusivamente à gestão do sistema por profissionais autorizados.

* **Autenticação Segura (Login):**
  * Login restrito utilizando e-mail corporativo e senha criptografada via **Firebase Authentication**.

* **Recuperação de Senha (Esqueci minha Senha):**
  * Opção de redefinição de credenciais com envio automático de link de reconfiguração para o e-mail cadastrado.
  * Proteção contra enumeração de usuários (o sistema exibe mensagem de sucesso mesmo se o e-mail não existir, por motivos de segurança).

* **CRUD de Cardápios Semanais (Editor em Abas):**
  * Editor visual organizado em abas (Segunda a Sexta-feira) para facilitar a digitação.
  * Campos para preencher os pratos correspondentes a cada uma das 5 refeições diárias.
  * Indicador visual automático de progresso (ícone `✓` na aba do dia) quando este possui pratos já cadastrados.
  * Validação e higienização automática do texto (limpeza de espaços extras e caracteres indesejados).

* **Cardápios de Exceção (Urgências e Eventos Especiais):**
  * Ferramenta de cadastro de cardápios específicos para datas fixas (ex: feriados, eventos institucionais ou substituições emergenciais).
  * Esses cardápios sobrepõem automaticamente a programação semanal padrão apenas na data escolhida.

* **Gestão de Localidades (Campi e Estados):**
  * Formulário de cadastro de novos Estados (com verificação de duplicidade de sigla).
  * Formulário de cadastro de novos Campi associados a um Estado específico.
  * Listagem geral e opção de remoção (deletar) de campi direto do painel.

* **Cadastro de Novas Nutricionistas (Gestão de Acesso):**
  * Possibilidade de criar novas contas de acesso administrativas diretamente pelo painel, sem necessidade de acessar o console de banco de dados.

---

## ⚙️ 3. Camada de Segurança, Dados e Hospedagem

* **Persistência de Dados e Queries Otimizadas:**
  * Uso do **Cloud Firestore** para armazenamento e sincronização em tempo real de estados, campi, usuários e cardápios.
  * Sistema de cache local temporário de 60 segundos para evitar requisições repetidas à nuvem (reduzindo latência e consumo de dados).

* **Dupla Camada de Proteção de Acesso:**
  * **Frontend:** Validação de perfil administrativo (`role: "nutritionist"`) direto no código antes de liberar a visualização do painel CRUD.
  * **Regras de Segurança (Backend Firestore):** Configuração de regras rígidas no servidor de banco de dados do Firebase. Alunos possuem permissão apenas de **leitura** (`read: if true`), enquanto operações de **escrita** (`write`) exigem autenticação ativa.

* **Hospedagem Estática Sem Dependências locais:**
  * O site foi projetado para rodar direto pelo navegador sem a dependência de um servidor de backend pesado (Node.js/PHP) para funcionar, facilitando a hospedagem em ferramentas gratuitas como **GitHub Pages** e **Firebase Hosting**.

---

## 🏗️ 4. Arquitetura do Projeto (MTC / MVC)

O projeto foi estruturado seguindo os princípios de separação de responsabilidades do padrão **MVC (Model-View-Controller)**, adaptado para um contexto frontend moderno utilizando **MTC (Model-Template-Controller)**:

* **Model (Modelo de Dados):** 
  * Implementado via serviços do Firebase (`js/firebase-config.js`) e gerenciadores de acesso a dados (`js/data.js`). 
  * Responsável pela lógica de negócios da aplicação com os dados, autenticação, comunicação com o **Cloud Firestore**, manipulação das coleções e sistema de cache local.
* **Template / View (Visualização):**
  * Representado pelos arquivos HTML (`index.html` e `admin.html`) e pelas estilizações em CSS.
  * Atuam como a camada de apresentação, contendo a estrutura das páginas, modais, botões e os espaços reservados (templates) que são preenchidos dinamicamente com informações dos cardápios e configurações.
* **Controller (Controlador):**
  * Gerenciado pelos scripts principais de lógica de interface (`js/app.js` para a área do aluno e `js/admin.js` para a área da nutricionista).
  * Interceptam eventos de interação do usuário (cliques, formulários, seleção de filtros), coordenam a solicitação de informações ao **Model** e atualizam dinamicamente a interface gráfica (**Template / View**) através de manipulação do DOM.

---

## 🤖 5. Declaração de Uso Responsável de IA

Este projeto foi desenvolvido com o auxílio de ferramentas de Inteligência Artificial (IA) para otimização de código, documentação e sugestões de implementação. Reforçamos que o uso da IA ocorreu de forma estritamente assistencial. Todas as decisões de arquitetura, design, segurança e regras de negócio foram ativamente supervisionadas, revisadas e validadas pelos desenvolvedores humanos responsáveis, garantindo a integridade, confiabilidade e o uso ético da tecnologia no desenvolvimento desta aplicação.
