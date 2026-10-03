"use client";

import { createContext } from "react";

export const DEFAULT_AUTH_CONTEXT = Object.freeze({
  authUser: null,
  dbUser: null,
  roles: [],
  loading: true,
  authError: "",
  beginSessionEstablishment: () => {},
  finishSessionEstablishment: async () => {},
  beginLogout: () => {},
  cancelLogout: () => {},
});

export const AuthContext = createContext(DEFAULT_AUTH_CONTEXT);
