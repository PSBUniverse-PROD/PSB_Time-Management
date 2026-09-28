import "server-only";
import { getSupabaseAdmin } from "@/core/supabase/admin";

export async function createBusinessUser({
  email,
  password,
  nameFields = {},
  extraUserFields = {},
  roleRows = [],
}) {
  if (!email || !password) {
    throw new Error("email and password are required");
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData?.user?.id) {
    throw new Error(authError?.message || "Failed to create auth user");
  }

  const authUserId = authData.user.id;

  const userInsertPayload = {
    email,
    auth_user_id: authUserId,
    ...nameFields,
    ...extraUserFields,
  };

  const { data: dbUser, error: dbUserError } = await supabaseAdmin
    .from("psb_s_user")
    .insert(userInsertPayload)
    .select("*")
    .single();

  if (dbUserError || !dbUser?.user_id) {
    await supabaseAdmin.auth.admin.deleteUser(authUserId);
    throw new Error(dbUserError?.message || "Failed to create business user");
  }

  if (!Array.isArray(roleRows) || roleRows.length === 0) {
    return {
      authUser: authData.user,
      dbUser,
      roles: [],
    };
  }

  const roleInsertRows = roleRows.map((row) => ({
    ...row,
    user_id: dbUser.user_id,
  }));

  const { data: roles, error: rolesError } = await supabaseAdmin
    .from("psb_m_userapproleaccess")
    .insert(roleInsertRows)
    .select("*");

  if (rolesError) {
    await supabaseAdmin.from("psb_s_user").delete().eq("user_id", dbUser.user_id);
    await supabaseAdmin.auth.admin.deleteUser(authUserId);
    throw new Error(rolesError.message || "Failed to create user role rows");
  }

  return {
    authUser: authData.user,
    dbUser,
    roles: Array.isArray(roles) ? roles : [],
  };
}
