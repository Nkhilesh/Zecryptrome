
const SUPABASE_URL = "https://uqvsgxfabasfrbzfmfcu.supabase.co/";
const SUPABASE_KEY = "sb_publishable_Zgvt_M3SZOQjnaZqpH4yjQ_bqelxr29";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

console.log("Supabase client initialized!");


async function signUp(email, password, name = "") {
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } } // display name, shown in the greeting and Profile
  });

  if (error) {
    console.error("Signup error:", error.message);
    throw error;
  }

  return data;
}

async function login(email, password) {
  const { data, error } =
    await db.auth.signInWithPassword({
      email,
      password
    });

  if (error) {
    console.error("Login error:", error.message);
    throw error;
  }

  return data;
}

async function logout() {
  const { error } = await db.auth.signOut();

  if (error) {
    console.error("Logout error:", error.message);
    throw error;
  }
}

