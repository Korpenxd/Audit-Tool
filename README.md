# Birdbrain IT Website Audit

A Swedish/English website audit tool for performance, SEO, accessibility and technical quality. It works without accounts or a database and is prepared for deployment on Vercel.

## Run locally

1. Install Node.js 22.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open `http://localhost:3000`.

## Deploy to Vercel

1. Extract this folder and upload its contents to a new GitHub repository. `package.json` must be in the repository root.
2. In Vercel, select **Add New → Project** and import that repository.
3. Keep the detected framework as **Next.js** and leave the Root Directory empty.
4. Select **Deploy**.
5. After the deployment works, add `audit.birdbrain.it` under **Settings → Domains** and use the DNS record Vercel provides in GoDaddy.

## Optional PageSpeed integration

The built-in audit works without external services. To add Lighthouse scores and lab metrics, create a Google PageSpeed Insights API key and add it in Vercel under **Settings → Environment Variables**:

```text
PAGESPEED_API_KEY=your_key_here
```

Redeploy after adding or changing the key.

## Privacy

Audit results are calculated for the submitted URL and are not stored by this project.
