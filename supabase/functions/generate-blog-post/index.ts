import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { startupId, product, paymentDate } = await req.json();

    if (!startupId) {
      return new Response(
        JSON.stringify({ error: "startupId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch the startup data
    const { data: startup, error: startupError } = await supabase
      .from("startups")
      .select("*")
      .eq("id", startupId)
      .single();

    if (startupError || !startup) {
      console.error("Startup not found:", startupError);
      return new Response(
        JSON.stringify({ error: "Startup not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if a blog post already exists for this startup
    const { data: existingPost } = await supabase
      .from("blog_posts")
      .select("id")
      .eq("startup_id", startupId)
      .limit(1)
      .single();

    if (existingPost) {
      console.log("Blog post already exists for startup:", startup.title);
      return new Response(
        JSON.stringify({
          message: "Blog post already exists",
          postId: existingPost.id,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Generate blog content using AI
    const blogContent = await generateBlogContent(startup, product, openaiApiKey);

    // Create slug from title
    const blogSlug = createSlug(blogContent.title);

    // Insert the blog post
    const { data: blogPost, error: insertError } = await supabase
      .from("blog_posts")
      .insert({
        startup_id: startupId,
        title: blogContent.title,
        slug: blogSlug,
        excerpt: blogContent.excerpt,
        content: blogContent.content,
        meta_description: blogContent.metaDescription,
        meta_keywords: blogContent.metaKeywords,
        og_image: startup.screenshot_url || startup.logo_url,
        author: "SubmitHunt Team",
        status: "published",
        published_at: new Date().toISOString(),
      })
      .select("id, slug")
      .single();

    if (insertError) {
      // Handle slug collision - append random suffix
      if (insertError.code === "23505") {
        const uniqueSlug = `${blogSlug}-${Date.now().toString(36)}`;
        const { data: retryPost, error: retryError } = await supabase
          .from("blog_posts")
          .insert({
            startup_id: startupId,
            title: blogContent.title,
            slug: uniqueSlug,
            excerpt: blogContent.excerpt,
            content: blogContent.content,
            meta_description: blogContent.metaDescription,
            meta_keywords: blogContent.metaKeywords,
            og_image: startup.screenshot_url || startup.logo_url,
            author: "SubmitHunt Team",
            status: "published",
            published_at: new Date().toISOString(),
          })
          .select("id, slug")
          .single();

        if (retryError) {
          console.error("Error inserting blog post (retry):", retryError);
          throw retryError;
        }

        console.log("Blog post created with unique slug:", uniqueSlug);
        return new Response(
          JSON.stringify({
            message: "Blog post created",
            postId: retryPost.id,
            slug: retryPost.slug,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      console.error("Error inserting blog post:", insertError);
      throw insertError;
    }

    console.log("Blog post created:", blogPost.slug, "for startup:", startup.title);

    return new Response(
      JSON.stringify({
        message: "Blog post created",
        postId: blogPost.id,
        slug: blogPost.slug,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error generating blog post:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function createSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 80);
}

async function generateBlogContent(
  startup: any,
  product: string,
  openaiApiKey: string | undefined
): Promise<{
  title: string;
  excerpt: string;
  content: string;
  metaDescription: string;
  metaKeywords: string;
}> {
  const category = startup.category || "Technology";
  const authorName = startup.author?.name || "the team";

  // If no OpenAI key, generate template-based content
  if (!openaiApiKey) {
    return generateTemplateBlogContent(startup, product, category, authorName);
  }

  try {
    const prompt = `Write an SEO-optimized blog post about a startup that just launched on SubmitHunt (a Product Hunt alternative platform). Use the following details:

Startup Name: ${startup.title}
Website: ${startup.url}
Description: ${startup.description}
Category: ${category}
Plan: ${product} (featured/premium listing)

Requirements:
1. Write a compelling, unique blog post (600-900 words)
2. Use proper HTML formatting with <h2>, <h3>, <p>, <ul>, <li> tags
3. Include the startup name naturally 3-5 times for SEO
4. Include keywords related to the category: ${category}
5. Include a section about why this startup stands out
6. Include a section about the problem it solves
7. End with a call-to-action to check out the startup on SubmitHunt
8. Write in a professional but engaging tone

Return a JSON object with these exact fields:
- title: SEO-friendly blog post title (50-70 chars, include the startup name)
- excerpt: Short summary for blog listing cards (120-160 chars)
- content: Full HTML blog post content
- metaDescription: SEO meta description (150-160 chars)
- metaKeywords: Comma-separated keywords (8-12 keywords)`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an expert SEO blog writer. Always respond with valid JSON only, no markdown code blocks.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error("OpenAI API error:", await response.text());
      return generateTemplateBlogContent(startup, product, category, authorName);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return generateTemplateBlogContent(startup, product, category, authorName);
    }

    // Parse the JSON response, handling potential markdown code blocks
    const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleanContent);

    return {
      title: parsed.title || `${startup.title} Launches on SubmitHunt`,
      excerpt: parsed.excerpt || startup.description?.substring(0, 155) || "",
      content: parsed.content || "",
      metaDescription:
        parsed.metaDescription || startup.description?.substring(0, 155) || "",
      metaKeywords:
        parsed.metaKeywords ||
        `${startup.title}, ${category}, startup, SubmitHunt`,
    };
  } catch (error) {
    console.error("AI generation failed, using template:", error);
    return generateTemplateBlogContent(startup, product, category, authorName);
  }
}

function generateTemplateBlogContent(
  startup: any,
  product: string,
  category: string,
  authorName: string
): {
  title: string;
  excerpt: string;
  content: string;
  metaDescription: string;
  metaKeywords: string;
} {
  const title = `${startup.title} - New ${category} Startup Launches on SubmitHunt`;
  const excerpt = `Discover ${startup.title}, a new ${category.toLowerCase()} startup that just launched on SubmitHunt. ${startup.description?.substring(0, 80) || ""}`;
  const startupUrl = `https://submithunt.com/startup/${startup.slug}`;
  const websiteUrl = startup.url;
  const description = startup.description || `A new ${category.toLowerCase()} startup.`;

  const planBadge =
    product === "featured"
      ? "Featured"
      : product === "premium"
      ? "Premium"
      : product;

  const content = `
<p><strong>${startup.title}</strong> has officially launched on <a href="https://submithunt.com">SubmitHunt</a>, the leading Product Hunt alternative for discovering innovative startups and AI projects. This exciting new ${category.toLowerCase()} product is now live and ready for the community to explore.</p>

<h2>What is ${startup.title}?</h2>
<p>${description}</p>
<p>Created by ${authorName}, ${startup.title} aims to make a meaningful impact in the ${category.toLowerCase()} space. The product launched as a ${planBadge} listing on SubmitHunt, highlighting its quality and the team's commitment to reaching early adopters.</p>

${startup.screenshot_url ? `<img src="${startup.screenshot_url}" alt="${startup.title} screenshot" style="max-width:100%;border-radius:8px;margin:20px 0;" />` : ""}

<h2>Why ${startup.title} Stands Out</h2>
<p>In an increasingly competitive ${category.toLowerCase()} landscape, ${startup.title} differentiates itself by focusing on solving real user problems with an intuitive approach. The team behind the product has built something that addresses genuine needs in the market.</p>
<ul>
  <li>Built with a focus on user experience and simplicity</li>
  <li>Addresses a real gap in the ${category.toLowerCase()} market</li>
  <li>Launched on SubmitHunt to connect directly with early adopters and tech enthusiasts</li>
</ul>

<h2>The Problem It Solves</h2>
<p>Every great startup begins with a problem worth solving. ${startup.title} tackles challenges that users face in the ${category.toLowerCase()} space, providing a streamlined solution that saves time and delivers results.</p>

<h2>Why Launch on SubmitHunt?</h2>
<p>SubmitHunt has become one of the top Product Hunt alternatives for founders looking to get their products discovered. With a growing community of tech enthusiasts, investors, and early adopters, SubmitHunt provides startups with the visibility they need to grow.</p>
<p>Benefits of launching on SubmitHunt include:</p>
<ul>
  <li>High-authority DR 37+ backlink for SEO</li>
  <li>Exposure to thousands of daily visitors</li>
  <li>Community upvoting and feedback</li>
  <li>Featured placement for premium listings</li>
</ul>

<h2>Check Out ${startup.title}</h2>
<p>Ready to see what ${startup.title} has to offer? Visit the listing on SubmitHunt to learn more, upvote, and show your support for this promising new ${category.toLowerCase()} startup.</p>
<p><a href="${startupUrl}" target="_blank" rel="noopener"><strong>View ${startup.title} on SubmitHunt →</strong></a></p>
${websiteUrl ? `<p>You can also visit their website directly: <a href="${websiteUrl}" target="_blank" rel="noopener">${websiteUrl}</a></p>` : ""}

<hr />
<p><em>Discover more innovative startups and AI projects on <a href="https://submithunt.com">SubmitHunt</a> - the best Product Hunt alternative for launching your startup.</em></p>
`;

  const metaDescription = `${startup.title} launches on SubmitHunt. Discover this new ${category.toLowerCase()} startup and learn what makes it stand out. Visit SubmitHunt to upvote and support.`;
  const metaKeywords = `${startup.title}, ${category}, startup launch, SubmitHunt, Product Hunt alternative, new startup, ${category.toLowerCase()} tools, startup discovery, indie hacker, tech startup`;

  return {
    title: title.substring(0, 70),
    excerpt: excerpt.substring(0, 160),
    content,
    metaDescription: metaDescription.substring(0, 160),
    metaKeywords,
  };
}
