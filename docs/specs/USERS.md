# Users

## Registration

- [x] The first user to register is automatically granted the **admin** role.
- [x] Subsequent users can be added by the admin via the Admin page.
- [x] Users authenticate with username and password.

## Authentication

- [x] JWT-based session tokens stored in localStorage.
- [x] Session tokens are renewed periodically.
- [x] Login page detects if the server is uninitialized and offers admin account creation.

## Password Change

- [x] A **Change Password** button in Settings opens a dialog.
- [x] The dialog collects current password, new password, and confirmation.
- [x] Server verifies the current password before applying the change.

## API Tokens

- [x] Users can create long-lived API tokens (10-year expiry) from the Settings page.
- [x] API tokens are JWTs with `type: "api"` and stored in the `api_tokens` table.
- [x] Tokens can be used in the `Authorization: Bearer <token>` header for API authentication.
- [x] The full token value is shown only once at creation time; subsequent views show a truncated prefix.
- [x] Tokens can be revoked (deleted) at any time.

### API Endpoints

| Method     | Endpoint                | Description                   |
| ---------- | ----------------------- | ----------------------------- |
| [x] GET    | `/api/users/tokens`     | List own tokens (prefix only) |
| [x] POST   | `/api/users/tokens`     | Create a new token            |
| [x] DELETE | `/api/users/tokens/:id` | Revoke (delete) a token       |

## Roles

- [x] **admin** — full access: manage users, create/edit/delete books, manage access.
- [x] **user** — can create and manage their own books, access shared books.

## Admin Page

- [x] Lists all users with name, role, and creation date.
- [x] Admin can change user roles.
- [x] Admin can add new users.
- [x] Admin can delete users (except themselves).

_Implementation: [x]=Done [~]=Partial [ ]=Not Started | Last spec review: 2026-06-18_
