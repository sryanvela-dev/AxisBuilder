// The sample job for trying the app (Start screen > Open sample job): REF1's V-100 (user, 2026-10-26), with the
// client, unit, inspector and folders taken out (sampleJobData.ts, made by npm run sample:make). Its scan photos are
// public/sample-photos/ (ui/samplePhotos.ts gives them to the photo folder when the job opens). test/ui/sampleJob.test.ts
// checks it shows every feature a new inspector should see.

import { projectFileSchema, type Project } from '../data/schema.ts'
import { SAMPLE_DATA } from './sampleJobData.ts'

export function sampleProject(): Project {
  return projectFileSchema.parse(structuredClone(SAMPLE_DATA))
}
