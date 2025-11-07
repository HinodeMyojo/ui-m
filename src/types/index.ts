// Основные типы для модуля Skill Tracker

export type PartStatus = "not-started" | "in-progress" | "done";
export type ProjectStatus = "not-started" | "in-progress" | "done";
export type EntityType = "skill" | "part" | "project";

export interface SkillGroup {
  id: string;
  name: string;
  description?: string;
}

export interface Skill {
  id: string;
  groupId?: string;
  name: string;
  goalDescription?: string;
  expectedHours: number;
  spentHours: number;
  githubLink?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  progress?: number; // вычисляемое поле
}

export interface SkillPart {
  id: string;
  skillId: string;
  title: string;
  content?: string;
  status: PartStatus;
  expectedHours: number;
  spentHours: number;
  progress?: number; // вычисляемое поле
}

export interface PetProject {
  id: string;
  name: string;
  description?: string;
  githubLink?: string;
  image?: string;
  expectedHours: number;
  spentHours: number;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  skills?: Skill[]; // связанные навыки
  parts?: SkillPart[]; // связанные части
  links?: TaskLink[];
  sessions?: StudySession[];
  progress?: {
    byParts: number;
    byTime: number;
  };
}

export interface TaskLink {
  id: string;
  entityType: EntityType;
  entityId: string;
  taskId: string;
}

export interface StudySession {
  id: string;
  entityType: EntityType;
  entityId: string;
  startedAt: string;
  durationMin: number;
  note?: string;
}

export interface SkillsSummary {
  totalHours: number;
  todayHours: number;
  monthHours: number;
  progressPercent: number;
  topSkills: {
    skillId: string;
    name: string;
    hours: number;
  }[];
}

// API запросы
export interface CreateSkillRequest {
  groupId?: string;
  name: string;
  goalDescription?: string;
  expectedHours: number;
  githubLink?: string;
  tags?: string[];
}

export interface UpdateSkillRequest extends Partial<CreateSkillRequest> {
  spentHours?: number;
}

export interface CreateSkillPartRequest {
  skillId: string;
  title: string;
  content?: string;
  expectedHours: number;
}

export interface CreatePetProjectRequest {
  name: string;
  description?: string;
  githubLink?: string;
  image?: string;
  expectedHours: number;
}

export interface AttachSkillsRequest {
  skillIds: string[];
}

export interface AttachPartsRequest {
  partIds: string[];
}

export interface LogTimeRequest {
  entityType: EntityType;
  entityId: string;
  startedAt: string;
  durationMin: number;
  note?: string;
}
