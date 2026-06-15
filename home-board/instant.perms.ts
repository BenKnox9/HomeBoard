// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "@instantdb/react-native";

const rules = {
  // Unused Instant-managed system entity (storage stream-tracking). Already
  // deny-by-default with no rules; this block makes that explicit.
  $streams: {
    allow: {
      view: "false",
      create: "false",
      update: "false",
      delete: "false",
    },
  },
  $files: {
    allow: {
      view: "true",
      create: "auth.id != null && data.path.startsWith('boards/')",
      delete: "auth.id != null && data.path.startsWith('boards/')",
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
    bind: [
      "isCreator", "auth.id != null && auth.id in data.ref('creator.id')",
      "onlyModifiesLinks", "request.modifiedFields.all(field, field in ['ascents', 'likes', 'comments', 'playlists'])",
    ],
    allow: {
      view: "true",
      create: "auth.id != null",
      update: "isCreator || (auth.id != null && onlyModifiesLinks)",
      delete: "isCreator",
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
    bind: [
      "isOwner", "auth.id != null && auth.id in data.ref('creator.id')",
      "isPublicEditor", "data.visibility == 'public' && data.publicAccess == 'edit'",
      "onlyModifiesRoutes", "request.modifiedFields.all(field, field in ['routes', 'routeOrder'])",
    ],
    allow: {
      view: "isOwner || data.visibility == 'public'",
      create: "auth.id != null",
      update: "isOwner || (isPublicEditor && onlyModifiesRoutes)",
      delete: "isOwner",
    },
  },
} satisfies InstantRules;

export default rules;
