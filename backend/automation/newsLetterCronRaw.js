import cron from "node-cron";
import { JobModel } from "../models/jobModelRaw.js";
import { UserModel } from "../models/userModelRaw.js";
import { sendEmail } from "../utils/sendEmail.js";

export const newsLetterCron = () => {
  cron.schedule("*/1 * * * *", async () => {
    console.log("Running Newsletter Cron Automation (Raw PostgreSQL)");

    try {
      // Get jobs that haven't had newsletters sent yet
      const jobs = await JobModel.getJobsForNewsletter();

      if (jobs.length === 0) {
        console.log("No new jobs found for newsletter");
        return;
      }

      console.log(`Processing ${jobs.length} jobs for newsletter`);

      for (const job of jobs) {
        try {
          // Find users whose niches match the job niche
          const filteredUsers = await UserModel.findByJobNiche(job.jobNiche);

          if (filteredUsers.length === 0) {
            console.log(`No users found for job niche: ${job.jobNiche}`);
            continue;
          }

          console.log(
            `Sending newsletter to ${filteredUsers.length} users for job: ${job.title}`
          );

          // Send email to each matching user
          for (const user of filteredUsers) {
            try {
              const subject = `Hot Job Alert: ${job.title} in ${job.jobNiche} Available Now`;
              const message = `Hi ${user.name},

Great news! A new job that fits your niche has just been posted. The position is for a ${job.title} with ${job.companyName}, and they are looking to hire immediately.

Job Details:
- **Position:** ${job.title}
- **Company:** ${job.companyName}
- **Location:** ${job.location}
- **Salary:** ${job.salary}

Don't wait too long! Job openings like these are filled quickly. 

We're here to support you in your job search. Best of luck!

Best Regards,
JobSphere Team`;

              await sendEmail({
                email: user.email,
                subject,
                message,
              });

              console.log(`Newsletter sent to: ${user.email}`);
            } catch (emailError) {
              console.error(
                `Failed to send email to ${user.email}:`,
                emailError.message
              );
            }
          }

          // Mark job as newsletter sent
          await JobModel.updateById(job.id, { newsLettersSent: true });
          console.log(`Marked job ${job.title} as newsletter sent`);
        } catch (jobError) {
          console.error(`Error processing job ${job.id}:`, jobError.message);
        }
      }
    } catch (error) {
      console.error("ERROR IN NEWSLETTER CRON:", error.message);
    }
  });

  console.log("Newsletter cron job scheduled to run every minute");
};
