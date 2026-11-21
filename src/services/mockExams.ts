import type { MockExam, MockSection } from "../domain/types";
import { request } from "./api";

export interface MockExamPatch {
  answers?: Record<string, string>;
  flagged_ids?: string[];
  played_keys?: string[];
  current_index?: number;
  remaining_seconds?: number;
}

export async function listMockExams(): Promise<MockExam[]> {
  const data = await request<{ exams: MockExam[] }>("/mock-exams");
  return data.exams;
}

export async function createMockExam(section: MockSection): Promise<MockExam> {
  const data = await request<{ exam: MockExam }>("/mock-exams", {
    method: "POST",
    body: { section },
  });
  return data.exam;
}

export async function getMockExam(examId: string): Promise<MockExam> {
  const data = await request<{ exam: MockExam }>(`/mock-exams/${examId}`);
  return data.exam;
}

export async function updateMockExam(
  examId: string,
  patch: MockExamPatch,
): Promise<MockExam> {
  const data = await request<{ exam: MockExam }>(`/mock-exams/${examId}`, {
    method: "PATCH",
    body: patch,
  });
  return data.exam;
}

export async function submitMockExam(
  examId: string,
  patch?: MockExamPatch,
): Promise<MockExam> {
  const data = await request<{ exam: MockExam }>(
    `/mock-exams/${examId}/submit`,
    {
      method: "POST",
      body: patch ?? {},
    },
  );
  return data.exam;
}

export async function deleteMockExam(examId: string): Promise<void> {
  await request<void>(`/mock-exams/${examId}`, { method: "DELETE" });
}
