import { v4 as uuid } from "uuid";
import type { Project, ProjectStatus } from "../shared/types.js";
import { createProject, getProject, updateProject, listProjects } from "../shared/db.js";

export interface CreateProjectOptions {
  footage: string[];
  context: string;
  niche?: string[];
}

export async function createNewProject(options: CreateProjectOptions): Promise<Project> {
  const project: Project = {
    id: uuid(),
    createdAt: new Date(),
    updatedAt: new Date(),
    status: "created",
    footage: options.footage,
    context: options.context,
    niche: options.niche || ["lifestyle"],
  };

  await createProject(project);
  console.log(`[State] Created project: ${project.id}`);

  return project;
}

export async function getProjectById(id: string): Promise<Project | null> {
  return getProject(id);
}

export async function updateProjectStatus(id: string, status: ProjectStatus, error?: string): Promise<void> {
  await updateProject(id, { status, error });
  console.log(`[State] Project ${id} status: ${status}`);
}

export async function getProjectsByStatus(status: ProjectStatus): Promise<Project[]> {
  return listProjects(status);
}

export async function getAllProjects(): Promise<Project[]> {
  return listProjects();
}

export async function getRecentProjects(limit = 10): Promise<Project[]> {
  const projects = await listProjects();
  return projects.slice(0, limit);
}

export async function getProjectsReadyForReview(): Promise<Project[]> {
  return listProjects("review");
}

export async function getProjectsReadyToPost(): Promise<Project[]> {
  return listProjects("ready");
}

export async function approveProject(id: string): Promise<void> {
  await updateProject(id, { status: "ready" });
  console.log(`[State] Project ${id} approved for posting`);
}

export async function rejectProject(id: string, reason: string): Promise<void> {
  await updateProject(id, { status: "failed", error: `Rejected: ${reason}` });
  console.log(`[State] Project ${id} rejected: ${reason}`);
}

export interface ProjectStats {
  total: number;
  byStatus: Record<ProjectStatus, number>;
  recentlyCompleted: number;
  failed: number;
}

export async function getProjectStats(): Promise<ProjectStats> {
  const projects = await listProjects();

  const byStatus: Record<ProjectStatus, number> = {
    created: 0,
    researching: 0,
    story_planning: 0,
    editing: 0,
    review: 0,
    ready: 0,
    posting: 0,
    posted: 0,
    failed: 0,
  };

  for (const project of projects) {
    byStatus[project.status]++;
  }

  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentlyCompleted = projects.filter(
    (p) => p.status === "posted" && p.updatedAt.getTime() > oneWeekAgo
  ).length;

  return {
    total: projects.length,
    byStatus,
    recentlyCompleted,
    failed: byStatus.failed,
  };
}
