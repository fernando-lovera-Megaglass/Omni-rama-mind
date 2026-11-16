# Conectar Gmail de verdad con Omni

Omni envía y recibe correo por la API de Gmail a través de cinco Edge Functions de Supabase
(`supabase/functions/gmail-*`). El navegador solo conoce el **Client ID** de Google; el **Client secret** y los
tokens de cada cuenta viven únicamente en Supabase. Hasta que existan las credenciales, el botón
«Continuar con Google» del asistente de conexión muestra un aviso y la cuenta simulada sigue disponible.

## 1. Crear las credenciales en Google Cloud

1. Entra en [console.cloud.google.com](https://console.cloud.google.com) y crea un proyecto (o usa uno existente).
2. **APIs y servicios › Biblioteca**: busca **Gmail API** y pulsa *Habilitar*.
3. **APIs y servicios › Pantalla de consentimiento de OAuth**: tipo *Externo*, nombre «Omni CRM», tu correo de
   soporte. En *Usuarios de prueba* añade las cuentas de Gmail / Google Workspace que vas a conectar (mientras la
   app no esté verificada, solo esas cuentas podrán autorizarla).
4. **APIs y servicios › Credenciales › Crear credenciales › ID de cliente de OAuth**:
   - Tipo de aplicación: **Aplicación web**.
   - **URI de redireccionamiento autorizados**: añade exactamente
     `https://xysgvxnieigpaxtmxiui.supabase.co/functions/v1/gmail-oauth-callback`
   - Guarda y copia el **ID de cliente** y el **Secreto del cliente**.

Permisos que pide Omni: `gmail.send`, `gmail.readonly` y `userinfo.email`.

## 2. Dónde poner cada credencial

| Credencial | Dónde | Cómo |
| --- | --- | --- |
| Client ID | `app/.env` (navegador) | `VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com` y vuelve a construir (`npm run build`). |
| Client ID | Secretos de Supabase (Edge Functions) | `supabase secrets set GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com` |
| Client secret | **Solo** secretos de Supabase | `supabase secrets set GOOGLE_CLIENT_SECRET=xxxx` (nunca en `.env` ni en el código). |
| Orígenes permitidos (opcional) | Secretos de Supabase | `supabase secrets set APP_URL=https://tu-dominio,http://localhost:4173` |

Los secretos también se pueden pegar en el panel de Supabase: *Edge Functions › Secrets*.

## 3. Base de datos

Crea las tablas `connected_accounts` (cuentas de Google por usuario), `connected_account_tokens` (tokens; sin
políticas de lectura para clientes) e `inbox_messages` (últimos correos traídos):

```bash
node scripts/apply-migration.mjs supabase/gmail.sql
```

## 4. Desplegar las Edge Functions

```bash
npm i -g supabase            # CLI de Supabase (una vez)
supabase login
supabase link --project-ref xysgvxnieigpaxtmxiui
supabase functions deploy gmail-auth-url gmail-send gmail-sync gmail-account
supabase functions deploy gmail-oauth-callback --no-verify-jwt   # Google llega sin sesión de Supabase
```

`supabase/config.toml` ya declara `verify_jwt = false` para `gmail-oauth-callback`.

## 5. Usarlo en Omni

1. **Ajustes › General › Correo › Conectar cuenta de correo**: escribe tu dirección, elige **Google** y pulsa
   **Continuar con Google**. Autoriza en la pantalla de Google y volverás a Ajustes con la cuenta en estado
   *Activado* (la comprobación real usa `gmail.users.getProfile`; un token revocado la deja en *Error de conexión*).
2. **Compositor de correo** (ficha del contacto › Correo): con la cuenta de Google como remitente el correo sale
   por la API de Gmail y la cronología registra «enviado desde … por Gmail». Los envíos programados y el resto de
   proveedores siguen simulados.
3. **Bandeja de entrada › Sincronizar Gmail**: trae los últimos 50 mensajes de INBOX, los convierte en
   conversaciones (una por hilo), empareja el remitente con un contacto por su correo y lo registra en su
   cronología. Responder desde la bandeja contesta en el mismo hilo de Gmail.
4. **Desconectar** (menú Acciones de la cuenta) revoca el token en Google y borra la cuenta, sus tokens y sus
   mensajes.

## Problemas habituales

- **redirect_uri_mismatch**: la URI de redirección en Google Cloud no coincide exactamente con la de la función
  `gmail-oauth-callback` (sin barra final, con `https`).
- **access_denied / app no verificada**: añade la cuenta como usuario de prueba en la pantalla de consentimiento.
- **El aviso «Falta configurar las credenciales de Google»**: falta `VITE_GOOGLE_CLIENT_ID` en `app/.env` (y
  reconstruir) o no hay Supabase configurado.
- **Error de conexión en la cuenta**: pulsa *Comprobar estado*; si persiste, *Desconectar* y vuelve a conectar
  (Google solo entrega el refresh token en el primer consentimiento, por eso el flujo usa `prompt=consent`).
