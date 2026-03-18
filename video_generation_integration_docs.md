# Video Generation Integration Documentation

## Overview
This document outlines the changes made to `src/pages/GenerateResearch.tsx` to integrate the AI Video Generation feature. This feature allows users to generate a video summary of their research report using an n8n webhook, similar to the existing Podcast generation workflow.

## 1. Imports Added
*   **Icons**: Imported `Video` and `Clapperboard` from `lucide-react` for the UI.
*   **React**: Added default `React` import to resolve namespace issues with JSX.

## 2. State Management
New state variables were added to manage the video generation lifecycle:

```typescript
// Video state
const [videoScript, setVideoScript] = useState<string>('');
const [videoFileUrl, setVideoFileUrl] = useState<string | null>(null);
const [videoGenerating, setVideoGenerating] = useState(false);
const [videoElapsedSeconds, setVideoElapsedSeconds] = useState(0);
```

## 3. Logic Implementation: `handleGenerateVideo`
A new asynchronous callback function `handleGenerateVideo` was implemented to orchestrate the generation process:

1.  **Validation**: Checks if `reportId` and `selectedCompany` exist.
2.  **State Updates**: Sets `videoGenerating` to `true` and initializes the elapsed timer.
3.  **Webhook Call**: Sends a POST request to the n8n webhook.
    *   **URL**: `https://n8n.tikonacapital.com/webhook/generate-video` (Updated from `webhook-test` by user).
    *   **Payload**:
        ```json
        {
          "report_id": "...",
          "company_name": "...",
          "nse_symbol": "..."
        }
        ```
4.  **Polling**:
    *   Polls the `research_reports` table in Supabase for the `video_file_url` column.
    *   Uses a longer polling duration definition (60 attempts * 5 seconds = 5 minutes) to account for video rendering time.
    *   Also attempts to fetch `video_script` if available.
5.  **Completion**: Updates state with the returned URL and script, displays a success toast, and clears the timer.

## 4. UI Components
A new **Video Generation** card was added to the render method, located immediately after the Podcast Generation section (`{pdfFileId && ...}`).

### Features:
*   **Header**: Displays "Video Generation" title with a blue theme using the `Video` icon.
*   **Initial State**:
    *   Shows a description of the feature.
    *   **Generate Button**: "Generate Video Summary" button with `Clapperboard` icon.
    *   **Loading State**: Changes button to "Generating Video (mm:ss)..." with a spinner and active timer.
*   **Success State**:
    *   **Video Player**: Embeds a standard HTML5 `<video>` player pointing to the `videoFileUrl`.
    *   **Download Button**: "Download MP4" button that opens the video URL in a new tab.
    *   **Script Viewer**: A collapsible `<details>` section to view the raw `videoScript` text.

## 5. Clean Up
*   **Duplicate Removal**: Removed a duplicate declaration of `handleGenerateVideo` that was accidentally introduced during previous edits.
*   **Linting Fixes**: addressed `React` namespace issues by ensuring `React` is imported.

## Usage
1.  Complete the **Draft Report** step.
2.  Generate the **PPT** and convert to **PDF**.
3.  Scroll to the bottom of the page to find the **Video Generation** card.
4.  Click **Generate Video Summary** and wait for the process to complete (approx. 3-5 minutes).
