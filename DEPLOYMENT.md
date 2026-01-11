
# Deployment Guide: Vercel + Turso

Follow these steps to deploy your News App to the cloud.

## Phase 1: Create a Cloud Database (Turso)

1.  **Sign Up**: Go to **[turso.tech](https://turso.tech)** and sign up with GitHub.
2.  **Install CLI** (Optional, easier via Web):
    *   If you prefer the web dashboard, just create a new database named `news-db` in the Turso Dashboard.
3.  **Get Credentials**:
    *   Click on your new database.
    *   **Database URL**: Copy the URL. It looks like `libsql://news-db-yourname.turso.io`.
    *   **Auth Token**: Look for "Generate Token" or "Connect" button to get the `TURSO_AUTH_TOKEN`.
    *   *Save these for Phase 3.*

## Phase 2: Push Code to GitHub

1.  Go to **[GitHub.com](https://github.com)** and create a new repository (e.g., `ghana-news-feed`).
2.  Run these commands in your terminal ( VS Code terminal):
    ```bash
    git init
    git add .
    git commit -m "Initial commit"
    git branch -M main
    git remote add origin https://github.com/YOUR_USERNAME/ghana-news-feed.git
    git push -u origin main
    ```
    *(Replace `YOUR_USERNAME` and repo URL with yours)*

## Phase 3: Deploy to Vercel

1.  Go to **[vercel.com](https://vercel.com)** and sign up/login.
2.  Click **"Add New..."** -> **"Project"**.
3.  Select your `ghana-news-feed` repository and click **Import**.
4.  **Configure Project**:
    *   **Framework**: Next.js (should be auto-detected).
    *   **Environment Variables**: Expand this section and add:
        *   `TURSO_DATABASE_URL` = `your-turso-url-from-phase-1`
        *   `TURSO_AUTH_TOKEN` = `your-turso-token-from-phase-1`
5.  Click **Deploy**.

## Phase 4: Connect Android App

Once deployed, Vercel will give you a domain (e.g., `ghana-news-feed.vercel.app`).

*   **API URL**: `https://ghana-news-feed.vercel.app/api/news`
*   **Cron URL**: `https://ghana-news-feed.vercel.app/api/cron`

Update your Android app or other clients to use this new URL instead of `localhost`.

## Automatic Updates (Cron)

The app is set up to auto-refresh when users visit, but to ensure it runs even when no one is visiting, you can set up a **Vercel Cron Job** (Optional for now, as the frontend triggers it too).
*   The current setup triggers `/api/cron` every time the frontend loads (throttled).
