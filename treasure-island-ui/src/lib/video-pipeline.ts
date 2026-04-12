/**
 * Wan 2.1 Video Pipeline Builder
 * Generates ComfyUI workflows for real video generation using Wan 2.1
 * Supports both T2V (text-to-video) and I2V (image-to-video) modes
 */

export interface VideoWorkflowOptions {
  prompt: string;
  imageFile?: string; // For I2V mode
  seed?: number;
  steps?: number;
  guidance?: number;
  durationFrames?: number; // Automatically calculated from audio duration
  audioDurationMs?: number; // Optional: if provided, auto-calculate frames at 24fps
  negativPrompt?: string;
  sampler?: string;
  scheduler?: string;
}

export interface ComfyUINode {
  [key: string]: any;
}

export interface ComfyUIWorkflow {
  [key: string]: ComfyUINode;
}

/**
 * Build a Wan 2.1 Text-to-Video (T2V) workflow for ComfyUI
 * Generates video from text prompt
 */
export function buildWan2_1_T2VWorkflow(options: VideoWorkflowOptions): ComfyUIWorkflow {
  const {
    prompt,
    seed = 42,
    steps = 50,
    guidance = 7.5,
    durationFrames = calculateFrames(options.audioDurationMs || 5000),
    negativPrompt = 'blurry, low quality, distorted',
    sampler = 'euler',
    scheduler = 'karras',
  } = options;

  // Node numbering for ComfyUI
  const nodes: ComfyUIWorkflow = {};
  let nodeId = 1;

  // 1. Text prompt encoding (T5 XXL)
  const textEncoderId = nodeId++;
  nodes[textEncoderId.toString()] = {
    inputs: {
      text: prompt,
      clip: ['text_encoder', 0],
    },
    class_type: 'CLIPTextEncode',
    _meta: { title: 'Prompt Encoding' },
  };

  // 2. Negative prompt encoding
  const negativeEncoderId = nodeId++;
  nodes[negativeEncoderId.toString()] = {
    inputs: {
      text: negativPrompt,
      clip: ['text_encoder', 0],
    },
    class_type: 'CLIPTextEncode',
    _meta: { title: 'Negative Prompt' },
  };

  // 3. Load Wan 2.1 T2V diffusion model
  const modelLoaderId = nodeId++;
  nodes[modelLoaderId.toString()] = {
    inputs: {
      ckpt_name: 'wan2.1_t2v_1.3B_fp16.safetensors',
    },
    class_type: 'CheckpointLoaderSimple',
    _meta: { title: 'Load Wan 2.1 T2V Model' },
  };

  // 4. Load VAE for video decoding
  const vaeLoaderId = nodeId++;
  nodes[vaeLoaderId.toString()] = {
    inputs: {
      vae_name: 'wan_2.1_vae.safetensors',
    },
    class_type: 'VAELoader',
    _meta: { title: 'Load Wan 2.1 VAE' },
  };

  // 5. KSampler for diffusion
  const sampledId = nodeId++;
  nodes[sampledId.toString()] = {
    inputs: {
      seed: seed,
      steps: steps,
      cfg: guidance,
      sampler_name: sampler,
      scheduler: scheduler,
      denoise: 1.0,
      positive: [textEncoderId.toString(), 0],
      negative: [negativeEncoderId.toString(), 0],
      latent_image: ['empty_latent', 0],
      model: [modelLoaderId.toString(), 0],
    },
    class_type: 'KSampler',
    _meta: { title: 'Diffusion Sampler' },
  };

  // 6. VAE Decode to video
  const vaeDecodeId = nodeId++;
  nodes[vaeDecodeId.toString()] = {
    inputs: {
      samples: [sampledId.toString(), 0],
      vae: [vaeLoaderId.toString(), 0],
    },
    class_type: 'VAEDecode',
    _meta: { title: 'VAE Decode' },
  };

  // 7. Create empty latent (initialize generation)
  const emptyLatentId = nodeId++;
  nodes[emptyLatentId.toString()] = {
    inputs: {
      width: 1280,
      height: 720,
      length: durationFrames,
      batch_size: 1,
    },
    class_type: 'EmptyLatentVideo',
    _meta: { title: 'Empty Video Latent' },
  };

  // 8. Video combine and save (using VHS)
  const videoCombineId = nodeId++;
  nodes[videoCombineId.toString()] = {
    inputs: {
      images: [vaeDecodeId.toString(), 0],
      frame_rate: 24,
      loop_count: 0,
      format: 'video/mp4',
      codec: 'h264',
      crf: 20,
      save_output: true,
    },
    class_type: 'VHS_VideoCombine',
    _meta: { title: 'Save Video' },
  };

  // Reference nodes that loader provide
  nodes['text_encoder'] = {
    inputs: { ckpt_name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors' },
    class_type: 'TextEncoderLoader',
  };

  nodes['empty_latent'] = {
    inputs: { width: 1280, height: 720, length: durationFrames, batch_size: 1 },
    class_type: 'EmptyLatentVideo',
  };

  return nodes;
}

/**
 * Build a Wan 2.1 Image-to-Video (I2V) workflow for ComfyUI
 * Generates video from input image
 */
export function buildWan2_1_I2VWorkflow(options: VideoWorkflowOptions): ComfyUIWorkflow {
  const {
    imageFile,
    seed = 42,
    steps = 50,
    guidance = 7.5,
    durationFrames = calculateFrames(options.audioDurationMs || 5000),
    negativPrompt = 'static, frozen, no motion',
    sampler = 'euler',
    scheduler = 'karras',
  } = options;

  if (!imageFile) {
    throw new Error('I2V requires imageFile parameter');
  }

  const nodes: ComfyUIWorkflow = {};
  let nodeId = 1;

  // 1. Load input image
  const loadImageId = nodeId++;
  nodes[loadImageId.toString()] = {
    inputs: {
      image: imageFile,
    },
    class_type: 'LoadImage',
    _meta: { title: 'Load Reference Image' },
  };

  // 2. CLIP Vision encoding of image (for I2V feature injection)
  const clipVisionId = nodeId++;
  nodes[clipVisionId.toString()] = {
    inputs: {
      clip_name: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors',
      image: [loadImageId.toString(), 0],
    },
    class_type: 'CLIPVisionLoader',
    _meta: { title: 'Encode Reference Image' },
  };

  // 3. Load Wan 2.1 I2V model (14B, 720P)
  const modelLoaderId = nodeId++;
  nodes[modelLoaderId.toString()] = {
    inputs: {
      ckpt_name: 'Wan2_1-I2V-14B-720P_fp8_e4m3fn.safetensors',
    },
    class_type: 'CheckpointLoaderSimple',
    _meta: { title: 'Load Wan 2.1 I2V Model' },
  };

  // 4. Load VAE
  const vaeLoaderId = nodeId++;
  nodes[vaeLoaderId.toString()] = {
    inputs: {
      vae_name: 'wan_2.1_vae.safetensors',
    },
    class_type: 'VAELoader',
    _meta: { title: 'Load VAE' },
  };

  // 5. Negative prompt
  const negativeEncoderId = nodeId++;
  nodes[negativeEncoderId.toString()] = {
    inputs: {
      text: negativPrompt,
      clip: [modelLoaderId.toString(), 1],
    },
    class_type: 'CLIPTextEncode',
    _meta: { title: 'Negative Prompt' },
  };

  // 6. Image to latent (encode reference image)
  const imageToLatentId = nodeId++;
  nodes[imageToLatentId.toString()] = {
    inputs: {
      samples: [loadImageId.toString(), 0],
      vae: [vaeLoaderId.toString(), 0],
    },
    class_type: 'VAEEncode',
    _meta: { title: 'Encode Image to Latent' },
  };

  // 7. KSampler for I2V diffusion
  const sampledId = nodeId++;
  nodes[sampledId.toString()] = {
    inputs: {
      seed: seed,
      steps: steps,
      cfg: guidance,
      sampler_name: sampler,
      scheduler: scheduler,
      denoise: 0.75, // I2V typically uses lower denoise to preserve reference
      positive: [clipVisionId.toString(), 0],
      negative: [negativeEncoderId.toString(), 0],
      latent_image: [imageToLatentId.toString(), 0],
      model: [modelLoaderId.toString(), 0],
    },
    class_type: 'KSampler',
    _meta: { title: 'I2V Diffusion' },
  };

  // 8. VAE Decode
  const vaeDecodeId = nodeId++;
  nodes[vaeDecodeId.toString()] = {
    inputs: {
      samples: [sampledId.toString(), 0],
      vae: [vaeLoaderId.toString(), 0],
    },
    class_type: 'VAEDecode',
    _meta: { title: 'Decode to Video' },
  };

  // 9. Video save
  const videoCombineId = nodeId++;
  nodes[videoCombineId.toString()] = {
    inputs: {
      images: [vaeDecodeId.toString(), 0],
      frame_rate: 24,
      loop_count: 0,
      format: 'video/mp4',
      codec: 'h264',
      crf: 20,
      save_output: true,
    },
    class_type: 'VHS_VideoCombine',
    _meta: { title: 'Save Video' },
  };

  return nodes;
}

/**
 * Calculate number of frames needed for video duration at 24fps
 * @param audioDurationMs - Duration in milliseconds
 * @returns Number of frames (rounded to nearest 8 for model compatibility)
 */
export function calculateFrames(audioDurationMs: number): number {
  const FPS = 24;
  const durationSeconds = audioDurationMs / 1000;
  const frames = Math.ceil(durationSeconds * FPS);

  // Round to nearest 8 for better compatibility with diffusion models
  return Math.round(frames / 8) * 8;
}

/**
 * Validate audio duration and provide default/constraints
 */
export function validateAudioDuration(durationMs: number): number {
  const minMs = 1000; // 1 second
  const maxMs = 30000; // 30 seconds
  const defaultMs = 5000; // 5 seconds

  if (durationMs < minMs) {
    console.warn(`Audio duration ${durationMs}ms below minimum, using ${minMs}ms`);
    return minMs;
  }

  if (durationMs > maxMs) {
    console.warn(`Audio duration ${durationMs}ms exceeds maximum, capping at ${maxMs}ms`);
    return maxMs;
  }

  return durationMs;
}
