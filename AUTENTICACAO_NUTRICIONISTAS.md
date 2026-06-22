# 🔐 Autenticação de Nutricionistas — Cardápio Escolar IFRO

> **Escopo:** Esta área de autenticação (`admin.html`) é exclusiva para nutricionistas cadastradas.
> Alunos e usuários comuns acessam apenas o `index.html` (visualização pública do cardápio), **sem qualquer login ou senha**.

---

## 1. Visão Geral da Arquitetura de Auth

O projeto utiliza o **Firebase Authentication** com o provedor **Email/Senha** (EmailPassword).

```
admin.html  ──▶  Firebase Auth (Email/Password)
                       │
                       ▼
               Firestore /users/{uid}
               { email, name, role: "nutritionist" }
```

- O **cadastro** de novas nutricionistas é feito **somente pelo painel admin** (`admin.html → Usuários → Nova Nutricionista`).
- A **recuperação de senha** é feita pelo próprio Firebase via email — sem necessidade de backend customizado.
- Alunos **não têm conta** no Firebase Auth e **nunca verão** a tela de login.

---

## 2. Como Habilitar o Email/Senha no Firebase Console

> Pré-requisito obrigatório — sem isso, nenhum login ou reset de senha funciona.

1. Acesse [console.firebase.google.com](https://console.firebase.google.com)
2. Selecione seu projeto (`school-menu` ou equivalente)
3. No menu lateral: **Authentication → Sign-in method**
4. Clique em **Email/Password**
5. Ative o primeiro toggle: **"Email/Password — Enabled"**
6. Clique em **Salvar**

> ⚠️ **Não ative o "Email link (passwordless sign-in)"** — o projeto usa senha convencional.

---

## 3. Configurar o Template de Email de Redefinição (Recomendado)

O Firebase envia automaticamente o email de reset com um template padrão em inglês. Para personalizar:

1. No Firebase Console: **Authentication → Templates**
2. Clique em **"Password reset"**
3. Edite:
   - **Remetente:** `noreply@seudominio.edu.br` (ou configure um domínio personalizado)
   - **Assunto:** `Redefinição de senha — Cardápio Escolar IFRO`
   - **Corpo:** Personalize mencionando o sistema e instruções claras
4. Clique em **Salvar**

### Configurar Domínio Autorizado (Importante para produção)

1. **Authentication → Settings → Authorized domains**
2. Adicione o domínio onde `admin.html` está hospedado (ex: `cardapio.ifro.edu.br`)
3. O link de reset redirecionará para esse domínio após a redefinição

---

## 4. Como Funciona o Fluxo "Esqueci Minha Senha"

### 4.1 Fluxo para a Nutricionista

```
1. Acessa admin.html
2. Clica em "Esqueci minha senha"
3. Digita o email cadastrado
4. Clica "Enviar link de recuperação"
5. Recebe o email do Firebase com link seguro
6. Clica no link → abre página do Firebase para nova senha
7. Define nova senha → volta para admin.html e faz login
```

### 4.2 Código JavaScript responsável

Arquivo: `js/admin.js`

```javascript
// Exibe a tela de recuperação
document.getElementById('btn-show-reset').addEventListener('click', () => {
  document.getElementById('login-form-section').style.display  = 'none';
  document.getElementById('reset-form-section').style.display  = 'block';
  // ...limpa erros anteriores e foca no campo de email
});

// Volta para o login
document.getElementById('btn-back-login').addEventListener('click', () => {
  document.getElementById('reset-form-section').style.display  = 'none';
  document.getElementById('login-form-section').style.display  = 'block';
});

// Envia o email de recuperação
document.getElementById('reset-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('reset-email').value.trim();

  try {
    await auth.sendPasswordResetEmail(email);
    // Exibe mensagem genérica — nunca confirma se o email existe (segurança)
    successEl.textContent = '✅ Se o email estiver cadastrado, você receberá...';
  } catch (err) {
    errorEl.textContent = translateResetError(err.code);
  }
});
```

> **Segurança:** A mensagem de sucesso é **sempre exibida**, mesmo se o email não existir. Isso impede que atacantes descubram quais emails estão cadastrados (*user enumeration*).

---

## 5. Como Cadastrar uma Nova Nutricionista

> Apenas administradores com acesso ao painel admin podem criar contas.

1. Acesse `admin.html` e faça login como nutricionista já cadastrada
2. No menu lateral, clique em **Usuários**
3. Clique em **Nova Nutricionista**
4. Preencha:
   - Nome completo
   - Email institucional
   - Senha inicial (mínimo 6 caracteres)
5. Clique em **Criar Conta**

O sistema:
- Cria o usuário no **Firebase Auth**
- Salva o perfil em **Firestore `/users/{uid}`** com `role: "nutritionist"`
- A nutricionista já pode fazer login imediatamente

> 💡 **Recomendação:** Oriente a nutricionista a trocar a senha no primeiro acesso usando a função "Esqueci minha senha".

---

## 6. Como a Nutricionista Troca a Senha Após o Primeiro Acesso

**Opção A — Via "Esqueci minha senha" (recomendado):**
1. Acessa `admin.html`
2. Clica em **"Esqueci minha senha"**
3. Digita o email e clica em **"Enviar link de recuperação"**
4. Segue o link no email para definir nova senha

**Opção B — Via Firebase Console (apenas administradores):**
1. Acesse o Firebase Console → **Authentication → Users**
2. Encontre o email da nutricionista
3. Clique nos 3 pontos → **"Send password reset email"**

---

## 7. Erros Comuns e Soluções

| Código Firebase | Mensagem exibida | Causa | Solução |
|---|---|---|---|
| `auth/invalid-email` | Email inválido | Email mal formatado | Verificar digitação |
| `auth/user-not-found` | Não encontramos esse email | Email não cadastrado | Verificar se a conta foi criada no painel |
| `auth/too-many-requests` | Muitas tentativas | Rate limit do Firebase | Aguardar alguns minutos |
| `auth/network-request-failed` | Erro de conexão | Sem internet | Verificar conexão |
| `auth/wrong-password` | Senha incorreta | Senha errada no login | Usar "Esqueci minha senha" |
| `auth/invalid-credential` | Email ou senha incorretos | Credenciais inválidas | Verificar email/senha ou usar reset |

---

## 8. Segurança — Quem Pode Acessar o Quê

| Usuário | `index.html` | `admin.html` | Cardápios | Usuários |
|---|---|---|---|---|
| **Aluno / Usuário comum** | ✅ (somente leitura) | ❌ Nenhum acesso | ❌ | ❌ |
| **Nutricionista** | ✅ | ✅ Login necessário | ✅ CRUD completo | ✅ Ver lista |
| **Admin Firebase** | ✅ | ✅ | ✅ | ✅ Gerenciar no console |

> A proteção é feita em **dupla camada**:
> 1. **Frontend:** Verificação de `role: "nutritionist"` no Firestore antes de exibir qualquer funcionalidade
> 2. **Backend:** Regras de segurança do Firestore bloqueiam escritas não autorizadas server-side

---

## 9. Checklist de Configuração Inicial

- [ ] Firebase Authentication → Email/Password **habilitado**
- [ ] Domínio da aplicação adicionado em **Authorized Domains**
- [ ] Template de email de reset **personalizado em português**
- [ ] Pelo menos **uma nutricionista** cadastrada como conta inicial
- [ ] Arquivo `js/firebase-config.js` configurado com as credenciais do projeto correto
- [ ] Regras do Firestore revisadas para produção

---

## 10. Estrutura dos Arquivos Relacionados

```
school-menu/
├── admin.html              # Tela de login + formulário "Esqueci minha senha"
├── js/
│   ├── admin.js            # Lógica de auth, reset de senha e controle de acesso
│   └── firebase-config.js  # Credenciais do Firebase (não commitar com dados reais)
└── css/
    └── admin.css           # Estilos da tela de login, .reset-success, etc.
```

---

*Documentação gerada para o projeto **Cardápio Escolar IFRO**. Atualizado em junho/2026.*
