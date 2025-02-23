import { users, teams, posts, measurements } from "@shared/schema";
import type { User, InsertUser, Team, Post, Measurement } from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserTeam(userId: number, teamId: number): Promise<User>;
  updateUserPoints(userId: number, points: number): Promise<User>;
  
  // Team operations
  createTeam(team: Team): Promise<Team>;
  getTeams(): Promise<Team[]>;
  
  // Post operations
  createPost(post: Post): Promise<Post>;
  getPosts(): Promise<Post[]>;
  getPostsByTeam(teamId: number): Promise<Post[]>;
  
  // Measurement operations
  createMeasurement(measurement: Measurement): Promise<Measurement>;
  getMeasurementsByUser(userId: number): Promise<Measurement[]>;
  
  sessionStore: session.Store;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private teams: Map<number, Team>;
  private posts: Map<number, Post>;
  private measurements: Map<number, Measurement>;
  sessionStore: session.Store;
  currentId: number;

  constructor() {
    this.users = new Map();
    this.teams = new Map();
    this.posts = new Map();
    this.measurements = new Map();
    this.currentId = 1;
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId++;
    const user = { ...insertUser, id, points: 0, isAdmin: false } as User;
    this.users.set(id, user);
    return user;
  }

  async updateUserTeam(userId: number, teamId: number): Promise<User> {
    const user = this.users.get(userId);
    if (!user) throw new Error("User not found");
    const updatedUser = { ...user, teamId };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async updateUserPoints(userId: number, points: number): Promise<User> {
    const user = this.users.get(userId);
    if (!user) throw new Error("User not found");
    const updatedUser = { ...user, points: user.points + points };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async createTeam(team: Team): Promise<Team> {
    const id = this.currentId++;
    const newTeam = { ...team, id };
    this.teams.set(id, newTeam);
    return newTeam;
  }

  async getTeams(): Promise<Team[]> {
    return Array.from(this.teams.values());
  }

  async createPost(post: Post): Promise<Post> {
    const id = this.currentId++;
    const newPost = { ...post, id };
    this.posts.set(id, newPost);
    return newPost;
  }

  async getPosts(): Promise<Post[]> {
    return Array.from(this.posts.values());
  }

  async getPostsByTeam(teamId: number): Promise<Post[]> {
    const users = Array.from(this.users.values()).filter(u => u.teamId === teamId);
    const userIds = users.map(u => u.id);
    return Array.from(this.posts.values()).filter(p => userIds.includes(p.userId));
  }

  async createMeasurement(measurement: Measurement): Promise<Measurement> {
    const id = this.currentId++;
    const newMeasurement = { ...measurement, id };
    this.measurements.set(id, newMeasurement);
    return newMeasurement;
  }

  async getMeasurementsByUser(userId: number): Promise<Measurement[]> {
    return Array.from(this.measurements.values()).filter(m => m.userId === userId);
  }
}

export const storage = new MemStorage();
