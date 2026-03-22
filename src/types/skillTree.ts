// Skill Tree RPG System Types

export interface CharacterProfile {
  id: string;
  userId: string;
  name: string;
  title: string;
  level: number;
  currentXp: number;
  totalXp: number;
  nextLvlXp: number;
  hasImage: boolean;
}

export interface SkillCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  sortOrder: number;
  hasImage: boolean;
  totalXp: number;
  earnedXp: number;
  progress: number;
  skillCount: number;
  skills?: SkillNode[];
}

export interface SkillNode {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  sortOrder: number;
  hasImage: boolean;
  completionBonusXp: number;
  isCompleted: boolean;
  totalXp: number;
  earnedXp: number;
  progress: number;
  levelCount: number;
  levels?: SkillLevel[];
}

export interface SkillLevel {
  id: string;
  skillNodeId: string;
  name: string;
  description: string;
  levelNumber: number;
  sortOrder: number;
  completionBonusXp: number;
  xpPerSubSkill: number;
  isCompleted: boolean;
  examPassed: boolean;
  examTitle: string;
  examDescription: string;
  isLocked: boolean;
  totalXp: number;
  earnedXp: number;
  progress: number;
  subSkillCount: number;
  completedCount: number;
  subSkills?: SubSkill[];
}

export interface SubSkill {
  id: string;
  skillLevelId: string;
  title: string;
  description: string;
  sortOrder: number;
  xpValue: number;
  isCompleted: boolean;
}

export interface SkillTreeOverview {
  character: CharacterProfile;
  categories: SkillCategory[];
  totalCategories: number;
  totalSkills: number;
  completedSkills: number;
  totalXp: number;
  earnedXp: number;
}

// Export/Import
export interface SkillTreeExport {
  exportedAt: string;
  character: CharacterProfile;
  categories: CategoryExport[];
}

export interface CategoryExport {
  name: string;
  description: string;
  icon: string;
  color: string;
  sortOrder: number;
  skills: SkillNodeExport[];
}

export interface SkillNodeExport {
  name: string;
  description: string;
  icon: string;
  color: string;
  sortOrder: number;
  completionBonusXp: number;
  levels: SkillLevelExport[];
}

export interface SkillLevelExport {
  name: string;
  description: string;
  levelNumber: number;
  sortOrder: number;
  completionBonusXp: number;
  xpPerSubSkill: number;
  examTitle: string;
  examDescription: string;
  subSkills: SubSkillExport[];
}

export interface SubSkillExport {
  title: string;
  description: string;
  sortOrder: number;
  xpValue: number;
}

// Request types
export interface CreateCategoryRequest {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
}

export interface CreateSkillNodeRequest {
  categoryId: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
  completionBonusXp?: number;
}

export interface CreateSkillLevelRequest {
  skillNodeId: string;
  name: string;
  description?: string;
  levelNumber?: number;
  sortOrder?: number;
  completionBonusXp?: number;
  xpPerSubSkill?: number;
  examTitle?: string;
  examDescription?: string;
  previousLevelId?: string;
}

export interface CreateSubSkillRequest {
  skillLevelId: string;
  title: string;
  description?: string;
  sortOrder?: number;
  xpValue?: number;
}
