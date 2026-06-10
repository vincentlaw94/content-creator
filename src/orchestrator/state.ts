import { v4 as uuid } from "uuid";
import type { Project, ProjectStatus } from "../shared/types.js";
import { createProject, getProject, updateProject, listProjects } from "../shared/db.js";

export interface CreateProjectOptions {
  footage: string[];
  context: string;
  niche?: string[];
}

export function createNewProject(options: CreateProjectOptions): Project {
  const project: Project = {
    id: uuid(),
    createdAt: new Date(),
    updatedAt: new Date(),
    status: "created",
    footage: options.footage,
    context: options.context,
    niche: options.niche || ["lifestyle"],
  };

  createProject(project);
  console.log(`[State] Created project: ${project.id}`);

  return project;
}

export function getProjectById(id: string): Project | null {
  return getProject(id);
}

export function updateProjectStatus(id: string, status: ProjectStatus, error?: string): void {
  updateProject(id, { status, error });
  console.log(`[State] Project ${id} status: ${status}`);
}

export function getProjectsByStatus(status: ProjectStatus): Project[] {
  return listProjects(status);
}

export function getAllProjects(): Project[] {
  return listProjects();
}

export function getRecentProjects(limit = 10): Project[] {
  return listProjects().slice(0, limit);
}

export function getProjectsReadyForReview(): Project[] {
  return listProjects("review");
}

export function getProjectsReadyToPost(): Project[] {
  return listProjects("ready");
}

export function approveProject(id: string): void {
  updateProject(id, { status: "ready" });
  console.log(`[State] Project ${id} approved for posting`);
}

export function rejectProject(id: string, reason: string): void {
  updateProject(id, { status: "failed", error: `Rejected: ${reason}` });
  console.log(`[State] Project ${id} rejected: ${reason}`);
}

export interface ProjectStats {
  total: number;
  byStatus: Record<ProjectStatus, number>;
  recentlyCompleted: number;
  failed: number;
}

export function getProjectStats(): ProjectStats {
  const projects = listProjects();

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
