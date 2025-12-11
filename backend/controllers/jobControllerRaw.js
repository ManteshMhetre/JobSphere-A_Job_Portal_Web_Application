import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/error.js";
import { JobModel } from "../models/jobModelRaw.js";
import { UserModel } from "../models/userModelRaw.js";

export const postJob = catchAsyncErrors(async (req, res, next) => {
  const {
    title,
    jobType,
    location,
    companyName,
    introduction,
    responsibilities,
    qualifications,
    offers,
    salary,
    hiringMultipleCandidates,
    personalWebsiteTitle,
    personalWebsiteUrl,
    jobNiche,
  } = req.body;

  // Validate required fields
  if (!title || !jobType || !location || !companyName || !responsibilities || !qualifications || !salary || !jobNiche) {
    return next(new ErrorHandler("Please provide full job details.", 400));
  }

  // Check if user is employer
  if (req.user.role !== "Employer") {
    return next(new ErrorHandler("Only employers can post jobs.", 400));
  }

  // Validate job data
  const validationErrors = JobModel.validateJobData({
    title, jobType, location, companyName, responsibilities, 
    qualifications, salary, jobNiche, postedBy: req.user.id
  });
  
  if (validationErrors.length > 0) {
    return next(new ErrorHandler(validationErrors.join(", "), 400));
  }

  const jobData = {
    title,
    jobType,
    location,
    companyName,
    introduction,
    responsibilities,
    qualifications,
    offers,
    salary,
    hiringMultipleCandidates,
    personalWebsiteTitle,
    personalWebsiteUrl,
    jobNiche,
    postedBy: req.user.id,
  };

  const job = await JobModel.create(jobData);

  res.status(201).json({
    success: true,
    message: "Job posted successfully.",
    job,
  });
});

export const getAllJobs = catchAsyncErrors(async (req, res, next) => {
  const { city, niche, searchKeyword } = req.query;
  
  const filters = {};
  
  if (city) {
    filters.location = city;
  }
  
  if (niche) {
    filters.jobNiche = niche;
  }
  
  if (searchKeyword) {
    filters.search = searchKeyword;
  }

  const jobs = await JobModel.findAll(filters);
  
  res.status(200).json({
    success: true,
    jobs,
    message: "Jobs fetched successfully.",
  });
});

export const getMyJobs = catchAsyncErrors(async (req, res, next) => {
  
  if (req.user.role !== "Employer") {
    return next(new ErrorHandler("Only employers can access this resource.", 400));
  }

  const jobs = await JobModel.findByUserId(req.user.id);
  
  res.status(200).json({
    success: true,
    jobs,
    message: "Your jobs fetched successfully.",
  });
});

export const deleteJob = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  
  const job = await JobModel.findById(id);
  
  if (!job) {
    return next(new ErrorHandler("Job not found.", 404));
  }
  
  if (job.postedBy !== req.user.id) {
    return next(new ErrorHandler("You are not authorized to delete this job.", 403));
  }

  await JobModel.deleteById(id);
  
  res.status(200).json({
    success: true,
    message: "Job deleted successfully.",
  });
});

export const getASingleJob = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  
  const job = await JobModel.findByIdWithPoster(id);
  
  if (!job) {
    return next(new ErrorHandler("Job not found.", 404));
  }
  
  res.status(200).json({
    success: true,
    job,
  });
});