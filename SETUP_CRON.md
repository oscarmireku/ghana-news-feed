# How to Set Up Exact 10-Minute Cron Triggers

We have updated your GitHub Workflow to listen for a `repository_dispatch` event called `trigger-scrape`. Now you need to set up the external clock.

## Step 1: Generate a GitHub Access Token (PAT)
1. Go to **GitHub Settings** -> **Developer settings** -> **Personal access tokens** -> **Tokens (classic)**.
2. Click **Generate new token (classic)**.
3. Name it "Cron Trigger".
4. **Scopes:** Select `repo` (Full control of private repositories) or at minimum `workflow`.
5. **Generate** and **COPY** the token immediately. You won't see it again.

## Step 2: Configure Cron-Job.org
1. Log in to [Cron-Job.org](https://cron-job.org/).
2. Click **Create Cronjob**.
3. **Title:** Ghana News Scraper
4. **URL:** `https://api.github.com/repos/oscarmireku/ghana-news-feed/dispatches`
5. **Execution schedule:** Every 10 minutes.
6. **Advanced settings:**
   - **HTTP Method:** `POST`
   - **Headers:** (Click the + or "Add Header" button intentionally)
     - Key: `Authorization` | Value: `Bearer YOUR_COPIED_TOKEN_HERE`
     - Key: `Content-Type`  | Value: `application/json`
     - Key: `Accept`        | Value: `application/vnd.github.v3+json`
     - Key: `User-Agent`    | Value: `NewsScraper`
   - **Request Body:**
     - Type: `JSON`
     - Content:
       Copy and paste *exactly* this line (ensure you use double quotes `"`):
       ```json
       {"event_type": "trigger-scrape"}
       ```
       > **Warning:** Do not copy the backticks (```) or use single quotes ('). It must be valid JSON.

## Step 3: Test
1. Click "Test Run" on Cron-Job.org.
2. Go to your GitHub Repository -> **Actions** tab.
3. You should see a "News Scraper" workflow starting up triggered by "repository dispatch".
