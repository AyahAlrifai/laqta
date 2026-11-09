import { create } from 'zustand';
import type {
  AppError,
  AssigneeCandidate,
  AssigneeResolution,
  BugDraft,
  BugLanguage,
  CreateMeta,
  DuplicateHit,
  JiraProject,
  Session,
  SettingsView,
  VoiceLanguage,
} from '../../shared/types';
import { emptyHistory, type History, type RedactionMode, type Tool } from '../editor/model';

// UI-only state for the workbench window (spec section 2: the flow state lives in main).

export interface WorkbenchStore {
  session: Session | null;
  settingsView: SettingsView | null;
  projects: JiraProject[];

  // step 1
  prompt: string;
  projectKey: string;
  bugLanguage: BugLanguage;
  voiceLanguage: VoiceLanguage;
  history: History;
  tool: Tool;
  redactionMode: RedactionMode;
  textLabel: string;
  selectedId: string | null;
  imageVersion: number;
  draftError: AppError | null;

  // step 2
  aiDraft: BugDraft | null;
  draft: BugDraft | null;
  createMeta: CreateMeta | null;
  metaError: AppError | null;
  duplicates: DuplicateHit[];
  resolution: AssigneeResolution | null;
  assignee: AssigneeCandidate | null;
  assigneeConfirmed: boolean;
  extraValues: Record<string, string>;
  createError: AppError | null;

  set: (patch: Partial<WorkbenchStore>) => void;
  resetReview: () => void;
}

export const useWorkbench = create<WorkbenchStore>((set) => ({
  session: null,
  settingsView: null,
  projects: [],
  prompt: '',
  projectKey: '',
  bugLanguage: 'en',
  voiceLanguage: 'auto',
  history: emptyHistory(),
  tool: 'box',
  redactionMode: 'fill',
  textLabel: '',
  selectedId: null,
  imageVersion: 0,
  draftError: null,
  aiDraft: null,
  draft: null,
  createMeta: null,
  metaError: null,
  duplicates: [],
  resolution: null,
  assignee: null,
  assigneeConfirmed: false,
  extraValues: {},
  createError: null,
  set: (patch) => set(patch),
  resetReview: () =>
    set({
      aiDraft: null,
      draft: null,
      createMeta: null,
      metaError: null,
      duplicates: [],
      resolution: null,
      assignee: null,
      assigneeConfirmed: false,
      extraValues: {},
      createError: null,
    }),
}));
