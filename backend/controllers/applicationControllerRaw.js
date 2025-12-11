import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/error.js";
import { ApplicationModel } from "../models/applicationModelRaw.js";
import { JobModel } from "../models/jobModelRaw.js";
import { UserModel } from "../models/userModelRaw.js";
import { convertPhoneToNumber } from "../utils/phoneUtils.js";

export const postApplication = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { name, email, phone, address, coverLetter } = req.body;

  if (!name || !email || !phone || !address || !coverLetter) {
    return next(new ErrorHandler("Please provide all required details.", 400));
  }

  // Convert phone to number using utility
  const phoneNumber = convertPhoneToNumber(phone);
  if (phoneNumber === null) {
    return next(new ErrorHandler("Please provide a valid phone number (10-15 digits).", 400));
  }

  // Check if user is a job seeker
  if (req.user.role !== "Job Seeker") {
    return next(new ErrorHandler("Only job seekers can apply for jobs.", 400));
  }

  // Get job details
  const job = await JobModel.findByIdWithPoster(id);
  if (!job) {
    return next(new ErrorHandler("Job not found.", 404));
  }

  // Check if user already applied
  const existingApplication = await ApplicationModel.findExisting(req.user.id, id);
  if (existingApplication) {
    return next(new ErrorHandler("You have already applied for this job.", 400));
  }

  const applicationData = {
    jobSeekerUserId: req.user.id,
    jobSeekerName: name,
    jobSeekerEmail: email,
    jobSeekerPhone: phoneNumber,
    jobSeekerAddress: address,
    coverLetter,
    employerUserId: job.postedBy,
    jobId: id,
    jobTitle: job.title,
    resumePublicId: req.user.resumePublicId,
    resumeUrl: req.user.resumeUrl,
  };

  // Validate application data
  const validationErrors = ApplicationModel.validateApplicationData(applicationData);
  if (validationErrors.length > 0) {
    return next(new ErrorHandler(validationErrors.join(", "), 400));
  }

  const application = await ApplicationModel.create(applicationData);

  res.status(201).json({
    success: true,
    message: "Application submitted successfully.",
    application,
  });
});

export const employerGetAllApplication = catchAsyncErrors(async (req, res, next) => {
  if (req.user.role !== "Employer") {
    return next(new ErrorHandler("Only employers can access this resource.", 400));
  }

  const applications = await ApplicationModel.findByEmployer(req.user.id);
  
  res.status(200).json({
    success: true,
    applications,
  });
});

export const jobSeekerGetAllApplication = catchAsyncErrors(async (req, res, next) => {
  if (req.user.role !== "Job Seeker") {
    return next(new ErrorHandler("Only job seekers can access this resource.", 400));
  }

  const applications = await ApplicationModel.findByJobSeeker(req.user.id);
  
  res.status(200).json({
    success: true,
    applications,
  });
});

export const deleteApplication = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  
  const application = await ApplicationModel.findById(id);
  if (!application) {
    return next(new ErrorHandler("Application not found.", 404));
  }

  let deletedApplication;

  if (req.user.role === "Job Seeker") {
    if (application.jobSeekerUserId !== req.user.id) {
      return next(new ErrorHandler("You are not authorized to delete this application.", 403));
    }
    deletedApplication = await ApplicationModel.deleteByJobSeeker(id, req.user.id);
  } else if (req.user.role === "Employer") {
    if (application.employerUserId !== req.user.id) {
      return next(new ErrorHandler("You are not authorized to delete this application.", 403));
    }
    deletedApplication = await ApplicationModel.deleteByEmployer(id, req.user.id);
  } else {
    return next(new ErrorHandler("Invalid user role.", 400));
  }

  if (!deletedApplication) {
    return next(new ErrorHandler("Failed to delete application.", 500));
  }

  res.status(200).json({
    success: true,
    message: "Application deleted successfully.",
  });
});