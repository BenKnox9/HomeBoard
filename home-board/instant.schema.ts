// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/react-native";

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $streams: i.entity({
      abortReason: i.string().optional(),
      clientId: i.string().unique().indexed(),
      done: i.boolean().optional(),
      size: i.number().optional(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      imageURL: i.string().optional(),
      type: i.string().optional(),
      username: i.string().unique().indexed().optional(),
    }),
    ascents: i.entity({
      attempts: i.number(),
      loggedAt: i.number().indexed(),
    }),
    boards: i.entity({
      country: i.string().indexed().optional(),
      createdAt: i.number().indexed(),
      description: i.string().optional(),
      name: i.string().unique().indexed(),
    }),
    comments: i.entity({
      text: i.string(),
      createdAt: i.number().indexed(),
    }),
    likes: i.entity({
      createdAt: i.number().indexed(),
    }),
    playlists: i.entity({
      createdAt: i.number().indexed(),
      name: i.string().indexed(),
      routeOrder: i.string().optional(),
    }),
    routes: i.entity({
      createdAt: i.number().indexed(),
      description: i.string().optional(),
      grade: i.string().indexed(),
      holds: i.string(),
      name: i.string().indexed(),
    }),
  },
  links: {
    $streams$files: {
      forward: {
        on: "$streams",
        has: "many",
        label: "$files",
      },
      reverse: {
        on: "$files",
        has: "one",
        label: "$stream",
        onDelete: "cascade",
      },
    },
    $usersLinkedPrimaryUser: {
      forward: {
        on: "$users",
        has: "one",
        label: "linkedPrimaryUser",
        onDelete: "cascade",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "linkedGuestUsers",
      },
    },
    $usersSelectedBoard: {
      forward: {
        on: "$users",
        has: "one",
        label: "selectedBoard",
      },
      reverse: {
        on: "boards",
        has: "many",
        label: "selectedByUsers",
      },
    },
    ascentsUser: {
      forward: {
        on: "ascents",
        has: "one",
        label: "user",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "ascents",
      },
    },
    boardsCreator: {
      forward: {
        on: "boards",
        has: "one",
        label: "creator",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "createdBoards",
      },
    },
    boardsPhoto: {
      forward: {
        on: "boards",
        has: "one",
        label: "photo",
      },
      reverse: {
        on: "$files",
        has: "many",
        label: "boards",
      },
    },
    boardsRoutes: {
      forward: {
        on: "boards",
        has: "many",
        label: "routes",
      },
      reverse: {
        on: "routes",
        has: "one",
        label: "board",
      },
    },
    playlistsBoard: {
      forward: {
        on: "playlists",
        has: "one",
        label: "board",
      },
      reverse: {
        on: "boards",
        has: "many",
        label: "playlists",
      },
    },
    playlistsCreator: {
      forward: {
        on: "playlists",
        has: "one",
        label: "creator",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "playlists",
      },
    },
    playlistsRoutes: {
      forward: {
        on: "playlists",
        has: "many",
        label: "routes",
      },
      reverse: {
        on: "routes",
        has: "many",
        label: "playlists",
      },
    },
    routesAscents: {
      forward: {
        on: "routes",
        has: "many",
        label: "ascents",
      },
      reverse: {
        on: "ascents",
        has: "one",
        label: "route",
      },
    },
    routesComments: {
      forward: {
        on: "routes",
        has: "many",
        label: "comments",
      },
      reverse: {
        on: "comments",
        has: "one",
        label: "route",
      },
    },
    routesCreator: {
      forward: {
        on: "routes",
        has: "one",
        label: "creator",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "createdRoutes",
      },
    },
    routesLikes: {
      forward: {
        on: "routes",
        has: "many",
        label: "likes",
      },
      reverse: {
        on: "likes",
        has: "one",
        label: "route",
      },
    },
    commentsUser: {
      forward: {
        on: "comments",
        has: "one",
        label: "user",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "comments",
      },
    },
    likesUser: {
      forward: {
        on: "likes",
        has: "one",
        label: "user",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "likes",
      },
    },
  },
  rooms: {},
});

// This helps TypeScript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
