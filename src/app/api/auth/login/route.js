/**
 * Authentication Login Endpoint
 * POST /api/auth/login
 * Generates session token after Supabase authentication
 *
 * Note: CORS headers are no longer needed. All SSO validation is done
 * locally via the psb_user_payload cookie (scoped to .psbuniverse.com).
 */

import { getSupabaseAdmin } from '@/core/supabase/admin';
import { createUserSession } from '@/core/auth/session.service';
import { getPSBSessionCookieHeader, getPSBUserPayloadCookieHeader } from '@/core/auth/cookies.utils';

export async function POST(request) {
  try {
    const requestBody = await request.json();
    const { accessToken } = requestBody;

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Access token is required' }), {
        status: 400,
        headers: [['Content-Type', 'application/json']],
      });
    }

    // Verify the token with Supabase
    const supabaseAdmin = getSupabaseAdmin();
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);

    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired access token' }), {
        status: 401,
        headers: [['Content-Type', 'application/json']],
      });
    }

    const authUser = authData.user;

    // Resolve database user
    let dbUser = null;
    let roles = [];
    let moduleIds = [];
    let roleIds = [];

    try {
      // Try by auth_user_id first
      const { data: userByAuthId } = await supabaseAdmin
        .from('psb_s_user')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

      if (userByAuthId) {
        dbUser = userByAuthId;
      } else if (authUser.email) {
        // Fallback by email
        const { data: userByEmail } = await supabaseAdmin
          .from('psb_s_user')
          .select('*')
          .eq('email', authUser.email)
          .maybeSingle();

        if (userByEmail) {
          dbUser = userByEmail;

          // Auto-sync auth_user_id
          if (!userByEmail.auth_user_id) {
            await supabaseAdmin
              .from('psb_s_user')
              .update({ auth_user_id: authUser.id })
              .eq('user_id', userByEmail.user_id);
          }
        }
      }

      // Load user roles
      if (dbUser) {
        const { data: userRoles } = await supabaseAdmin
          .from('psb_m_userapproleaccess')
          .select('*')
          .eq('user_id', dbUser.user_id)
          .eq('is_active', true);

        roles = userRoles || [];
        moduleIds = [...new Set(roles.map((r) => r.app_id).filter(Boolean))];
        roleIds = [...new Set(roles.map((r) => r.role_id).filter(Boolean))];
      }
    } catch (error) {
      console.error('Database lookup error:', error);
      // Continue with minimal user data
    }

    if (!dbUser) {
      return new Response(JSON.stringify({ error: 'User not found in system' }), {
        status: 404,
        headers: [['Content-Type', 'application/json']],
      });
    }

    // Create session
    const session = await createUserSession(authUser, dbUser, roles);

    const responseBody = JSON.stringify({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: dbUser.user_id,
        email: authUser.email,
        name: `${dbUser.first_name || ''} ${dbUser.last_name || ''}`.trim(),
      },
    });

    // Use new Response() with array-based headers to reliably produce TWO separate Set-Cookie headers.
    // NextResponse.headers.set() + .append() does NOT reliably handle multiple Set-Cookie headers
    // in Node.js runtime — the Headers API may merge them with commas which is invalid for Set-Cookie.
    return new Response(responseBody, {
      status: 200,
      headers: [
        ['Content-Type', 'application/json'],
        ['Set-Cookie', getPSBSessionCookieHeader(session.token)],
        ['Set-Cookie', getPSBUserPayloadCookieHeader({
          userId: dbUser.user_id,
          email: authUser.email,
          fullName: `${dbUser.first_name || ''} ${dbUser.last_name || ''}`.trim(),
          modules: moduleIds,
          roles: roleIds,
        })],
      ],
    });
  } catch (error) {
    console.error('Login endpoint error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: [['Content-Type', 'application/json']],
    });
  }
}