output "website_url" {
  description = "HTTPS URL of the game (CloudFront)."
  value       = "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "bucket_name" {
  description = "Name of the private S3 bucket holding the game files."
  value       = aws_s3_bucket.site.id
}
