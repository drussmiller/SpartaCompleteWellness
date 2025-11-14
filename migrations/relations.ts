import { relations } from "drizzle-orm/relations";
import { activities, workoutVideos, posts, reactions, users, userAchievements, achievementTypes, messages } from "./schema";

export const workoutVideosRelations = relations(workoutVideos, ({one}) => ({
	activity: one(activities, {
		fields: [workoutVideos.activityId],
		references: [activities.id]
	}),
}));

export const activitiesRelations = relations(activities, ({many}) => ({
	workoutVideos: many(workoutVideos),
}));

export const reactionsRelations = relations(reactions, ({one}) => ({
	post: one(posts, {
		fields: [reactions.postId],
		references: [posts.id]
	}),
}));

export const postsRelations = relations(posts, ({one, many}) => ({
	reactions: many(reactions),
	post: one(posts, {
		fields: [posts.parentId],
		references: [posts.id],
		relationName: "posts_parentId_posts_id"
	}),
	posts: many(posts, {
		relationName: "posts_parentId_posts_id"
	}),
}));

export const userAchievementsRelations = relations(userAchievements, ({one}) => ({
	user: one(users, {
		fields: [userAchievements.userId],
		references: [users.id]
	}),
	achievementType: one(achievementTypes, {
		fields: [userAchievements.achievementTypeId],
		references: [achievementTypes.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	userAchievements: many(userAchievements),
	messages_senderId: many(messages, {
		relationName: "messages_senderId_users_id"
	}),
	messages_recipientId: many(messages, {
		relationName: "messages_recipientId_users_id"
	}),
}));

export const achievementTypesRelations = relations(achievementTypes, ({many}) => ({
	userAchievements: many(userAchievements),
}));

export const messagesRelations = relations(messages, ({one}) => ({
	user_senderId: one(users, {
		fields: [messages.senderId],
		references: [users.id],
		relationName: "messages_senderId_users_id"
	}),
	user_recipientId: one(users, {
		fields: [messages.recipientId],
		references: [users.id],
		relationName: "messages_recipientId_users_id"
	}),
}));