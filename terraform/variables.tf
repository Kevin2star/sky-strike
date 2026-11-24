variable "aws_region" {
  description = "Region where the S3 bucket is created."
  type        = string
  default     = "ap-northeast-2"
}

variable "bucket_name" {
  description = "Globally unique S3 bucket name for the static site."
  type        = string
}

variable "game_dir" {
  description = "Path to the directory containing the game files (index.html, style.css, game.js)."
  type        = string
  default     = "../game"
}

variable "tags" {
  description = "Tags applied to all resources."
  type        = map(string)
  default = {
    Project = "sky-strike"
  }
}
