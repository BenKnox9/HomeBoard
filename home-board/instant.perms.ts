// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "@instantdb/react-native";

const rules = {
  $files: {
    allow: {
      view: "true",
      create: "auth.id != null && data.path.startsWith('boards/')",
    },
  },
  $users: {
    allow: {
      view: "true",
      update: "auth.id == data.id",
    },
    fields: {
      email: "auth.id == data.id",
    },
  },
  boards: {
    allow: {
      view: "true",
      create: "auth.id != null",
      update: "auth.id != null && auth.id in data.ref('creator.id')",
      delete: "auth.id != null && auth.id in data.ref('creator.id')",
    },
  },
  routes: {
    allow: {
      view: "true",
      create: "auth.id != null",
      update: "auth.id != null && (auth.id in data.ref('creator.id') || request.modifiedFields.all(f, f in ['ascents', 'likes', 'comments', 'playlists']))",
      delete: "auth.id != null && auth.id in data.ref('creator.id')",
    },
  },
  ascents: {
    allow: {
      view: "true",
      create: "auth.id != null && auth.id in data.ref('user.id')",
      delete: "auth.id != null && auth.id in data.ref('user.id')",
    },
  },
  likes: {
    allow: {
      view: "true",
      create: "auth.id != null && auth.id in data.ref('user.id')",
      delete: "auth.id != null && auth.id in data.ref('user.id')",
    },
  },
  comments: {
    allow: {
      view: "true",
      create: "auth.id != null && auth.id in data.ref('user.id')",
      update: "auth.id != null && auth.id in data.ref('user.id')",
      delete: "auth.id != null && auth.id in data.ref('user.id')",
    },
  },
  playlists: {
    allow: {
      view: "auth.id != null && auth.id in data.ref('creator.id')",
      create: "auth.id != null",
      update: "auth.id != null && auth.id in data.ref('creator.id')",
      delete: "auth.id != null && auth.id in data.ref('creator.id')",
    },
  },
} satisfies InstantRules;

export default rules;
