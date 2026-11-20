# HIMB

HIMB es una plataforma independiente de gestion financiera y patrimonial.

## Tecnologias

- Next.js
- React
- JavaScript
- Tailwind CSS
- Supabase
- PostgreSQL

## Desarrollo local

Instalar dependencias:

```bash
npm install
```

Iniciar el servidor:

```bash
npm run dev
```

Abrir `http://localhost:3000`.

Las variables publicas de Supabase se encuentran documentadas en
`.env.local.example`. Las claves privadas nunca deben agregarse a variables
que comiencen con `NEXT_PUBLIC_`.

## Recuperacion de contraseña

En Supabase, agrega las URLs de redireccion de HIMB en **Authentication >
URL Configuration > Redirect URLs**:

- `http://localhost:3000/reset-password` para desarrollo local.
- La URL equivalente del dominio de produccion al publicar la aplicacion.

El correo de recuperacion usa esa ruta para establecer una sesion temporal y
permitir que el usuario defina una nueva contraseña.

## Datos financieros

HIMB usa autenticacion por correo y contrasena. Las tablas de cuentas,
categorias, movimientos, presupuestos y metas, junto con sus politicas RLS,
estan definidas en `supabase/migrations/20261119200000_himb_initial_schema.sql`.
Cada usuario autenticado solo puede consultar y modificar sus propios registros.

`.env.local` apunta al proyecto Supabase independiente de HIMB y no debe
compartirse ni subirse al repositorio. Para publicar la aplicacion, configura
`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` tambien en
el proveedor de hosting.
