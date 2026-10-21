<!-- Extracto de la documentación de Kie.ai que entregó la agencia (21-10-2026): el catálogo de modelos del Market (parte 1), sin la copia china. Es lo que se usó para escribir worker/lib/estudio/kie.js. -->

# KIE.AI API - Image & Video generation reference (compiled 2026-10-21)

Source: https://docs.kie.ai (llms.txt index). Base URL: https://api.kie.ai . Auth: `Authorization: Bearer <KIE_API_KEY>` (server-side only). Generation is ASYNC: POST createTask -> {code:200,data:{taskId}} -> poll GET /api/v1/jobs/recordInfo?taskId=... or use callBackUrl. Generated media kept 14 days.

# PART 1 - MARKET MODEL CATALOG (all use POST /api/v1/jobs/createTask with body {model, callBackUrl?, input:{...}}). Notation: name*:type[enum]=default(min..max); * = required

## market/seedream
- `bytedance/seedream-v4-text-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_size:string[square|square_hd|portrait_4_3|portrait_3_2|portrait_16_9|landscape_4_3|landscape_3_2|landscape_16_9|landscape_21_9]="square_hd";image_resolution:string[1K|2K|4K]="1K";max_images:number=1(1..6);seed:integer(..1000000);nsfw_checker:boolean
- `bytedance/seedream-v4-edit`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_urls*:array<string,max 10>;image_size:string[square|square_hd|portrait_4_3|portrait_3_2|portrait_16_9|landscape_4_3|landscape_3_2|landscape_16_9|landscape_21_9]="square_hd";image_resolution:string[1K|2K|4K]="1K";max_images:number=1(1..6);seed:integer(..1000000);nsfw_checker:boolean
- `seedream/4.5-text-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 3000);aspect_ratio*:string[1:1|4:3|3:4|16:9|9:16|2:3|3:2|21:9];quality*:string[basic|high];nsfw_checker:boolean
- `seedream/4.5-edit`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 3000);image_urls*:array<string,max 14>;aspect_ratio*:string[1:1|4:3|3:4|16:9|9:16|2:3|3:2|21:9];quality*:string[basic|high];nsfw_checker:boolean
- `seedream/5-lite-text-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 2995);aspect_ratio*:string[1:1|4:3|3:4|16:9|9:16|2:3|3:2|21:9];quality*:string[basic|high|ultra];output_format:string[png|jpeg];nsfw_checker:boolean
- `seedream/5-pro-text-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);aspect_ratio*:string[1:1|4:3|3:4|16:9|9:16|2:3|3:2|21:9];quality*:string[basic|high];output_format:string[png|jpeg]="png";nsfw_checker:boolean
- `seedream/5-pro-image-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_urls*:array<string,max 10>;aspect_ratio*:string[1:1|4:3|3:4|16:9|9:16|2:3|3:2|21:9];quality*:string[basic|high];output_format:string[png|jpeg]="png";nsfw_checker:boolean
- `seedream/5-pro-layer-decomposition`
  inputs: TOP.callBackUrl:string;prompt:string(maxLen 5000);image_url*:string;size*:string[auto|1K|1.5K|2K];output_format:string[png|jpeg]="jpeg"
- `bytedance/seedream`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_size:string[square|square_hd|portrait_4_3|portrait_16_9|landscape_4_3|landscape_16_9]="square_hd";guidance_scale:number=2.5(1..10);seed:integer
- `seedream/5-flash-text-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);aspect_ratio*:string[1:1|4:3|3:4|16:9|9:16|2:3|3:2|21:9];size:string[1K|1.5K|2K]="1K";output_format:string[png|jpeg];nsfw_checker:boolean
- `seedream/5-flash-image-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_urls*:array<string,max 10>;aspect_ratio*:string[1:1|4:3|3:4|16:9|9:16|2:3|3:2|21:9];size:string[1K|1.5K|2K]="1K";output_format:string[png|jpeg];nsfw_checker:boolean
- `seedream/5-flash-layer-decomposition`
  inputs: TOP.callBackUrl:string;prompt:string(maxLen 5000);image_url*:string;size:string[auto|1K|1.5K|2K]="auto";output_format:string[png|jpeg]="jpeg"

## market/seedream-5-lite-image-to-image.md
- `seedream/5-lite-image-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 2995);image_urls*:array<string,max 14>;aspect_ratio*:string[1:1|4:3|3:4|16:9|9:16|2:3|3:2|21:9];quality*:string[basic|high|ultra];output_format:string[png|jpeg];nsfw_checker:boolean

## market/z-image
- `z-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 1000);aspect_ratio*:string[1:1|4:3|3:4|16:9|9:16];nsfw_checker:boolean

## market/google
- `google/imagen4-fast`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);negative_prompt:string(maxLen 5000);aspect_ratio*:string[1:1|16:9|9:16|3:4|4:3|auto];seed:integer
- `google/imagen4-ultra`, `google/imagen4`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);negative_prompt:string(maxLen 5000);aspect_ratio*:string[1:1|16:9|9:16|3:4|4:3|auto];seed:string(maxLen 500)
- `google/nano-banana-edit`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 20000);image_urls*:array<string,max 10>;output_format:string[png|jpeg]="png";aspect_ratio:string[1:1|9:16|16:9|3:4|4:3|3:2|2:3|5:4|4:5|21:9|auto];image_size:string[1:1|9:16|16:9|3:4|4:3|3:2|2:3|5:4|4:5|21:9|auto]="1:1"
- `google/nano-banana`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 20000);output_format:string[png|jpeg]="png";aspect_ratio:string[1:1|9:16|16:9|3:4|4:3|3:2|2:3|5:4|4:5|21:9|auto];image_size:string[1:1|9:16|16:9|3:4|4:3|3:2|2:3|5:4|4:5|21:9|auto]="1:1";nsfw_checker:boolean
- `nano-banana-pro`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 20000);image_input:array<string,max 8>;aspect_ratio:string[1:1|2:3|3:2|3:4|4:3|4:5|5:4|9:16|16:9|21:9|auto]="1:1";resolution:string[1K|2K|4K]="1K";output_format:string[png|jpg]
- `nano-banana-2`, `nano-banana-2-1`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 20000);image_input:array<string,max 10>;aspect_ratio:string[1:1|2:3|3:2|1:4|4:1|3:4|4:3|4:5|5:4|1:8|8:1|9:16|16:9|21:9|auto]="auto";resolution:string[1K|2K|4K]="1K";output_format:string[png|jpg]="jpg"
- `nano-banana-2-lite`
  inputs: TOP.callBackUrl:string;image_urls:array=[]<string,max 10>;prompt*:string(maxLen 20000);aspect_ratio*:string[1:1|1:4|1:8|2:3|3:2|3:4|4:1|4:3|4:5|5:4|8:1|9:16|16:9|21:9|auto]
- `google/gemini-omni-flash-1-1`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 20000);image_urls:array<string>;first_frame_url:string;last_frame_url:string;audio_ids:array<string>;video_list:array<object>;character_ids:array<string>;duration*:string[4|6|8|10];aspect_ratio:string[16:9|9:16];resolution:string[360p|720p|1080p|4k]="720p";seed:integer

## market/flux2
- `flux-2/pro-text-to-image`, `flux-2/flex-text-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);aspect_ratio*:string[1:1|4:3|3:4|16:9|9:16|3:2|2:3];resolution*:string[1K|2K];nsfw_checker:boolean
- `flux-2/pro-image-to-image`, `flux-2/flex-image-to-image`
  inputs: TOP.callBackUrl:string;input_urls*:array<string,max 8>;prompt*:string(maxLen 5000);aspect_ratio*:string[1:1|4:3|3:4|16:9|9:16|3:2|2:3|auto];resolution*:string[1K|2K];nsfw_checker:boolean

## market/grok-imagine-image-2-0
- `grok-imagine-image-2-0/text-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 8000);aspect_ratio*:string[1:1|2:3|3:2|16:9|9:16]
- `grok-imagine-image-2-0/segment-map`
  inputs: TOP.callBackUrl:string
- `grok-imagine-image-2-0/segment-edit`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 65000);task_id*:string;mask_indexs:array<integer>
- `grok-imagine-image-2-0/image-edit`
  inputs: TOP.callBackUrl:string;prompt:string(maxLen 8000);aspect_ratio*:string[1:1|2:3|3:2|16:9|9:16|auto];image_urls*:array<string,max 5>

## market/grok-imagine
- `grok-imagine/text-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string;aspect_ratio*:string[2:3|3:2|1:1|16:9|9:16];nsfw_checker:boolean;enable_pro:boolean
- `grok-imagine/image-to-image`
  inputs: TOP.callBackUrl:string;prompt:string(maxLen 390000);image_urls*:array<string,max 5>;nsfw_checker:boolean
- `grok-imagine/text-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string;aspect_ratio:string[2:3|3:2|1:1|16:9|9:16]="2:3";mode:string[fun|normal|spicy]="normal";duration:number;resolution:string[480p|720p|1080p]="480p";nsfw_checker:boolean
- `grok-imagine/image-to-video`
  inputs: TOP.callBackUrl:string;image_urls:array<string,max 7>;task_id:string(maxLen 100);index:integer=0(0..1);prompt:string;mode:string[fun|normal|spicy]="normal";duration:string;resolution:string[480p|720p|1080p]="480p";aspect_ratio:string[2:3|3:2|1:1|16:9|9:16]="16:9";nsfw_checker:boolean
- `grok-imagine/upscale`
  inputs: TOP.callBackUrl:string;task_id*:string(maxLen 100);resolution:string[720p|1080p]="720p"
- `grok-imagine/extend`
  inputs: TOP.callBackUrl:string;task_id*:string(maxLen 100);prompt*:string;extend_at*:number=2(2..);extend_times*:string[6|10]
- `grok-imagine-video-1-5-preview`
  inputs: TOP.callBackUrl:string;prompt:string(maxLen 4096);image_urls:array<string,max 7>;aspect_ratio:string[1:1|16:9|9:16|3:2|2:3|auto]="auto";resolution:string[480p|720p|1080p]="480p";duration:integer=8(1..15);nsfw_checker:boolean

## market/gpt
- `gpt-image-2-5-flare-text-to-image`, `gpt-image-2-5-sunburst-text-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 20000);aspect_ratio:string[auto|1:1|3:2|2:3|4:3|3:4|16:9|9:16|21:9|27:16|16:27|9:8|8:9];resolution:string[1K|2K|4K];background:string[transparent|opaque|auto]
- `gpt-image-2-5-flare-image-to-image`, `gpt-image-2-5-sunburst-image-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string;input_urls:array<string,max 16>;aspect_ratio:string[auto|1:1|3:2|2:3|4:3|3:4|16:9|9:16|21:9|27:16|16:27|9:8|8:9];resolution:string[1K|2K|4K];background:string[transparent|opaque|auto]
- `gpt-image-2-text-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 20000);aspect_ratio:string[auto|1:1|3:2|2:3|4:3|3:4|5:4|4:5|16:9|9:16|2:1|1:2|3:1|1:3|21:9|9:21];resolution:string[1K|2K|4K];background:string[transparent|opaque|auto]
- `gpt-image-2-image-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string;input_urls:array<string,max 16>;aspect_ratio:string[auto|1:1|3:2|2:3|4:3|3:4|5:4|4:5|16:9|9:16|2:1|1:2|3:1|1:3|21:9|9:21];resolution:string[1K|2K|4K];background:string[transparent|opaque|auto]

## market/gpt-image
- `gpt-image/1.5-text-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string;aspect_ratio*:string[1:1|2:3|3:2];quality*:string[medium|high]
- `gpt-image/1.5-image-to-image`
  inputs: TOP.callBackUrl:string;input_urls*:array<string,max 16>;prompt*:string;aspect_ratio*:string[1:1|2:3|3:2];quality*:string[medium|high]

## market/topaz
- `topaz/image-upscale`
  inputs: TOP.callBackUrl:string;image_url*:string;upscale_factor*:string[1|2|4]="2"
- `topaz/video-upscale`
  inputs: TOP.callBackUrl:string;video_url*:string;upscale_factor:string[1|2|4]="2"

## market/recraft
- `recraft/remove-background`, `recraft/crisp-upscale`
  inputs: TOP.callBackUrl:string;image*:string

## market/ideogram
- `ideogram/character-edit`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_url*:string;mask_url*:string;reference_image_urls*:array<string,max 1>;rendering_speed:string[TURBO|BALANCED|QUALITY]="BALANCED";style:string[AUTO|REALISTIC|FICTION]="AUTO";expand_prompt:boolean;num_images:string[1|2|3|4]="1";seed:integer
- `ideogram/character-remix`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_url*:string;reference_image_urls*:array<string,max 1>;rendering_speed:string[TURBO|BALANCED|QUALITY]="BALANCED";style:string[AUTO|REALISTIC|FICTION]="AUTO";expand_prompt:boolean;image_size:string[square|square_hd|portrait_4_3|portrait_16_9|landscape_4_3|landscape_16_9]="square_hd";num_images:string[1|2|3|4]="1";seed:integer;strength:number=0.8(0.1..1);negative_prompt:string(maxLen 500);image_urls:array<string,max 5>;reference_mask_urls:string
- `ideogram/character`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);reference_image_urls*:array<string,max 1>;rendering_speed:string[TURBO|BALANCED|QUALITY]="BALANCED";style:string[AUTO|REALISTIC|FICTION]="AUTO";expand_prompt:boolean;num_images:string[1|2|3|4]="1";image_size:string[square|square_hd|portrait_4_3|portrait_16_9|landscape_4_3|landscape_16_9]="square_hd";seed:integer;negative_prompt:string(maxLen 5000)
- `ideogram/v3-text-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);rendering_speed:string[TURBO|BALANCED|QUALITY];style:string[AUTO|GENERAL|REALISTIC|DESIGN];expand_prompt:boolean;image_size:string[square|square_hd|portrait_4_3|portrait_16_9|landscape_4_3|landscape_16_9];seed:integer;negative_prompt:string(maxLen 5000)
- `ideogram/v3-edit`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_url*:string;mask_url*:string;rendering_speed:string[TURBO|BALANCED|QUALITY]="BALANCED";expand_prompt:boolean=true;seed:integer
- `ideogram/v3-remix`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_url*:string;rendering_speed:string[TURBO|BALANCED|QUALITY];style:string[AUTO|GENERAL|REALISTIC|DESIGN];expand_prompt:boolean;image_size:string[square|square_hd|portrait_4_3|portrait_16_9|landscape_4_3|landscape_16_9];num_images:string[1|2|3|4];seed:integer;strength:number(0.01..1);negative_prompt:string(maxLen 5000)

## market/qwen
- `qwen/text-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_size:string[square|square_hd|portrait_4_3|portrait_16_9|landscape_4_3|landscape_16_9];num_inference_steps:number=30(2..250);seed:integer;guidance_scale:number=2.5(0..20);enable_safety_checker:boolean;output_format:string[png|jpeg]="png";negative_prompt:string(maxLen 500);acceleration:string[none|regular|high]="none";nsfw_checker:boolean
- `qwen/image-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_url*:string;strength:number=0.8(0..1);output_format:string[png|jpeg]="png";acceleration:string[none|regular|high]="none";negative_prompt:string(maxLen 500);seed:integer;num_inference_steps:number=30(2..250);guidance_scale:number=2.5(0..20);enable_safety_checker:boolean;nsfw_checker:boolean
- `qwen/image-edit`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 2000);image_url*:string;acceleration:string[none|regular|high]="none";image_size:string[square|square_hd|portrait_4_3|portrait_16_9|landscape_4_3|landscape_16_9]="landscape_4_3";num_inference_steps:number=25(2..49);seed:integer;guidance_scale:number=4(0..20);num_images:string[1|2|3|4];enable_safety_checker:boolean;output_format:string[jpeg|png]="png";negative_prompt:string(maxLen 500);nsfw_checker:boolean

## market/qwen2
- `qwen2/image-edit`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 800);image_url*:array<string,max 3>;image_size:string[1:1|2:3|3:2|3:4|4:3|9:16|16:9|21:9]="16:9";seed:integer;output_format:string[jpeg|png];nsfw_checker:boolean
- `qwen2/text-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_size:string[1:1|3:4|4:3|9:16|16:9]="16:9";seed:integer;output_format:string[jpeg|png];nsfw_checker:boolean

## market/qwen2-1
- `qwen2-1/text-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);aspect_ratio:string[1:1|4:3|3:4|3:2|2:3|16:9|9:16|21:9|9:21]="1:1";resolution:string[1K|2K]="1K";background:string[opaque|transparent]="opaque";output_format:string[png|webp|jpeg]="png";enhance_prompt:boolean=true;seed:integer;nsfw_checker:boolean
- `qwen2-1/image-to-image`
  inputs: TOP.callBackUrl:string;image_urls*:array<string,max 10>;prompt*:string(maxLen 5000);mask_url:string;aspect_ratio:string[auto|1:1|4:3|3:4|3:2|2:3|16:9|9:16|21:9|9:21]="auto";resolution:string[1K|2K]="1K";background:string[opaque|transparent]="opaque";output_format:string[png|webp|jpeg]="png";enhance_prompt:boolean=true;seed:integer;nsfw_checker:boolean

## market/qwen3-pro
- `qwen3/pro-text-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);resolution:string[1K|2K];image_size:string[1:1|3:2|2:3|4:3|3:4|16:9|9:16|21:9]="16:9";output_format:string[png|jpeg];prompt_extend:boolean=true;negative_prompt:string(maxLen 5000);seed:integer(0..2147483647);nsfw_checker:boolean=false
- `qwen3/pro-image-to-image`
  inputs: TOP.callBackUrl:string;image_urls*:array<string,max 3>;prompt*:string(maxLen 5000);resolution:string[1K|2K]="1K";image_size:string[1:1|3:2|2:3|4:3|3:4|16:9|9:16|21:9]="16:9";output_format:string[png|jpeg];prompt_extend:boolean=true;negative_prompt:string(maxLen 5000);seed:integer(0..2147483647);nsfw_checker:boolean=false

## market/qwen3
- `qwen3/text-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);resolution:string[1K|2K];image_size:string[1:1|3:2|2:3|4:3|3:4|16:9|9:16|21:9]="16:9";output_format:string[png|jpeg];prompt_extend:boolean=true;negative_prompt:string(maxLen 5000);seed:integer(0..2147483647);nsfw_checker:boolean=false
- `qwen3/image-to-image`
  inputs: TOP.callBackUrl:string;image_urls*:array<string,max 3>;prompt*:string(maxLen 5000);resolution:string[1K|2K]="1K";image_size:string[1:1|3:2|2:3|4:3|3:4|16:9|9:16|21:9]="16:9";output_format:string[png|jpeg];prompt_extend:boolean=true;negative_prompt:string(maxLen 5000);seed:integer(0..2147483647);nsfw_checker:boolean=false

## market/wan
- `wan/2-7-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);input_urls:array<string,max 9>;aspect_ratio:string[1:1|16:9|4:3|21:9|3:4|9:16|8:1|1:8];enable_sequential:boolean=false;n:integer;resolution:string[1K|2K]="2K";thinking_mode:boolean=false;color_palette:array<object,max 10>;bbox_list:array<array>;watermark:boolean=false;seed:integer(0..2147483647);nsfw_checker:boolean
- `wan/2-7-image-pro`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);input_urls:array<string,max 9>;aspect_ratio:string[1:1|16:9|4:3|21:9|3:4|9:16|8:1|1:8];enable_sequential:boolean=false;n:integer;resolution:string[1K|2K|4K]="2K";thinking_mode:boolean=false;color_palette:array<object,max 10>;bbox_list:array<array>;watermark:boolean=false;seed:integer(0..2147483647);nsfw_checker:boolean
- `wan/2-2-a14b-image-to-video-turbo`
  inputs: TOP.callBackUrl:string;image_url*:string;prompt*:string(maxLen 5000);resolution:string[480p|720p]="720p";enable_prompt_expansion:boolean;seed:number(0..2147483647);acceleration:string[none|regular]="none";nsfw_checker:boolean
- `wan/2-2-a14b-speech-to-video-turbo`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_url*:string;audio_url*:string;num_frames:number=80(40..120);frames_per_second:number=16(4..60);resolution:string[480p|580p|720p]="480p";negative_prompt:string(maxLen 500);seed:integer;num_inference_steps:number=27(2..40);guidance_scale:number=3.5(1..10);shift:number=5(1..10);nsfw_checker:boolean
- `wan/2-2-a14b-text-to-video-turbo`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);resolution:string[480p|720p]="720p";aspect_ratio:string[16:9|9:16]="16:9";enable_prompt_expansion:boolean;seed:number(0..2147483647);acceleration:string[none|regular]="none";nsfw_checker:boolean
- `wan/2-2-animate-move`
  inputs: TOP.callBackUrl:string;video_url*:string;image_url*:string;resolution:string[720p]="720p";nsfw_checker:boolean
- `wan/2-2-animate-replace`
  inputs: TOP.callBackUrl:string;video_url*:string;image_url*:string;resolution:string[480p|580p|720p]="480p";nsfw_checker:boolean
- `wan/2-6-image-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_urls*:array<string,max 1>;duration:string[5|10|15]="5";resolution:string[720p|1080p]="1080p";multi_shots:boolean=false;nsfw_checker:boolean
- `wan/2-6-text-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);duration:string[5|10|15]="5";resolution:string[720p|1080p];multi_shots:boolean=false;nsfw_checker:boolean
- `wan/2-6-video-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);video_urls*:array<string,max 3>;duration:string[5|10]="5";resolution:string[720p|1080p];multi_shots:boolean=false;nsfw_checker:boolean
- `wan/2-6-flash-image-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 1500);image_urls*:array<string,max 1>;duration:string[5|10|15]="5";resolution:string[720p|1080p]="1080p";audio*:boolean;multi_shots:boolean;nsfw_checker:boolean
- `wan/2-6-flash-video-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 1500);video_urls*:array<string,max 3>;duration:string[5|10]="5";resolution:string[720p|1080p]="1080p";audio:boolean;multi_shots:boolean;nsfw_checker:boolean
- `wan/2-5-image-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 800);image_url*:string;duration*:string[5|10];resolution*:string[720p|1080p];negative_prompt:string(maxLen 500);enable_prompt_expansion:boolean;seed:integer
- `wan/2-5-text-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 800);duration*:string[5|10];aspect_ratio:string[16:9|9:16|1:1];resolution*:string[720p|1080p];negative_prompt:string(maxLen 500);enable_prompt_expansion:boolean;seed:integer;nsfw_checker:boolean
- `wan/2-7-text-to-video`
  inputs: prompt*:string(maxLen 5000);negative_prompt:string(maxLen 500);audio_url:string;resolution:string[720p|1080p]="1080p";ratio:string[16:9|9:16|1:1|4:3|3:4]="16:9";duration:integer=5(2..15);prompt_extend:boolean=true;watermark:boolean=false;seed:integer(0..2147483647);nsfw_checker:boolean;TOP.callBackUrl:string
- `wan/2-7-image-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);negative_prompt:string(maxLen 500);first_frame_url:string;last_frame_url:string;first_clip_url:string;driving_audio_url:string;resolution:string[720p|1080p]="1080p";duration:integer=5(2..15);prompt_extend:boolean=true;watermark:boolean=false;seed:integer(0..2147483647);nsfw_checker:boolean
- `wan/2-7-videoedit`
  inputs: TOP.callBackUrl:string;prompt:string(maxLen 5000);negative_prompt:string(maxLen 500);video_url*:string;reference_image:string;resolution:string[720p|1080p]="1080p";aspect_ratio:string[16:9|9:16|1:1|4:3|3:4];duration:integer=0(0..10);audio_setting:string[auto|origin]="auto";prompt_extend:boolean=true;watermark:boolean=false;seed:integer(0..2147483647);nsfw_checker:boolean
- `wan/2-7-r2v`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);negative_prompt:string(maxLen 500);reference_image:array<string,max 5>;reference_video:array<string,max 5>;first_frame:string;reference_voice:string;resolution:string[720p|1080p]="1080p";aspect_ratio:string[16:9|9:16|1:1|4:3|3:4]="16:9";duration:integer=5(2..10);prompt_extend:boolean=true;watermark:boolean=false;seed:integer(0..2147483647);nsfw_checker:boolean
- `wan/3-0-video`
  inputs: TOP.callBackUrl:string;prompt:string(maxLen 20000);first_frame_url:string;last_frame_url:string;reference_image_urls:array<string,max 10>;reference_video_urls:array<string,max 5>;reference_audio_urls:array<string,max 5>;reference_file_urls:array<string,max 1>;reference_link_urls:array<string,max 1>;resolution:string[480P|720P|1080P]="1080P";aspect_ratio:string[adaptive|16:9|4:3|1:1|3:4|9:16]="adaptive";duration:integer=5;audio:boolean=true;seed:integer(0..2147483647)
- `wan/3-0-video-prime`
  inputs: TOP.callBackUrl:string;prompt:string(maxLen 20000);first_frame_url:string;last_frame_url:string;reference_image_urls:array<string,max 10>;reference_video_urls:array<string,max 5>;reference_audio_urls:array<string,max 5>;reference_file_urls:array<string,max 1>;reference_link_urls:array<string,max 1>;resolution:string[480P|720P|1080P]="1080P";aspect_ratio:string[adaptive|16:9|4:3|1:1|3:4|9:16]="adaptive";duration:integer=5;audio:boolean=true;seed:integer(0..2147483647);nsfw_checker:boolean

## market/flux3
- `flux-3/klein-text-to-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);aspect_ratio:string[1:1|4:3|3:4|3:2|2:3|16:9|9:16|21:9|9:21]="1:1";resolution:string[1K|2K|4K]="1K";width:integer(256..4096);height:integer(256..4096);output_format:string[png|jpeg|webp]="png";num_images:integer=1(1..4);seed:integer(0..2147483647);enhance_prompt:boolean[true|false]=true;nsfw_checker:boolean
- `flux-3/klein-edit-image`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_urls*:array<string,max 10>;aspect_ratio:string[1:1|4:3|3:4|3:2|2:3|16:9|9:16|21:9|9:21|auto]="auto";resolution:string[1K|2K|4K]="1K";width:integer(256..4096);height:integer(256..4096);output_format:string[png|jpeg|webp]="png";num_images:integer=1(1..4);seed:integer(0..2147483647);enhance_prompt:boolean[true|false]=true;nsfw_checker:boolean

## 4o-image-api/generate-4-o-image.md
- `4o-image-api`
  inputs: TOP.callBackUrl:string;prompt:string;files_url:array<string>;size*:string[1:1|3:2|2:3];file_url:string

## flux-kontext-api/generate-or-edit-image.md
- `flux1-kontext`
  inputs: TOP.callBackUrl:string;prompt*:string;model:string[flux-kontext-pro|flux-kontext-max]="flux-kontext-pro";enable_translation:boolean;upload_cn:boolean;input_image:string;aspect_ratio:string[21:9|16:9|4:3|1:1|3:4|9:16];output_format:string[jpeg|png]="jpeg";prompt_upsampling:boolean=false;safety_tolerance:integer[0|1|2|3|4|5|6]=2;watermark:string

## market/kling
- `kling-2.6/text-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 2500);sound*:boolean;aspect_ratio*:string[1:1|16:9|9:16];duration*:string[5|10]
- `kling-2.6/image-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 2500);image_urls*:array<string,max 1>;sound*:boolean;duration*:string[5|10]
- `kling/v2-5-turbo-image-to-video-pro`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 2500);image_url*:string;tail_image_url:string;duration*:string[5|10];negative_prompt:string(maxLen 2496);cfg_scale:number=0.5(0..1)
- `kling/v2-5-turbo-text-to-video-pro`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 2500);duration*:string[5|10];aspect_ratio:string[16:9|9:16|1:1]="16:9";negative_prompt:string(maxLen 2500);cfg_scale:number=0.5(0..1)
- `kling/ai-avatar-standard`, `kling/ai-avatar-pro`
  inputs: TOP.callBackUrl:string;image_url*:string;audio_url*:string;prompt*:string(maxLen 5000)
- `kling/v2-1-master-image-to-video`, `kling/v2-1-standard`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_url*:string;duration*:string[5|10];negative_prompt:string(maxLen 500);cfg_scale:number=0.5(0..1)
- `kling/v2-1-master-text-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);duration*:string[5|10];aspect_ratio:string[16:9|9:16|1:1]="16:9";negative_prompt:string(maxLen 500);cfg_scale:number=0.5(0..1)
- `kling/v2-1-pro`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_url*:string;duration*:string[5|10];negative_prompt:string(maxLen 500);cfg_scale:number=0.5(0..1);tail_image_url:string
- `kling-2.6/motion-control`
  inputs: TOP.callBackUrl:string;prompt:string(maxLen 2500);input_urls*:array<string,max 1>;video_urls*:array<string,max 1>;character_orientation*:string[image|video];mode*:string[720p|1080p]
- `kling-3.0/motion-control`
  inputs: TOP.callBackUrl*:string;prompt:string;input_urls*:array<string,max 1>;video_urls*:array<string,max 1>;mode:string[720p|1080p]="720p";character_orientation:string
- `kling-3.0/video`
  inputs: TOP.callBackUrl:string;prompt:string;image_urls:array<string>;sound*:boolean;duration*:string[3|4|5|6|7|8|9|10|11|12|13|14|15];aspect_ratio:string[16:9|9:16|1:1];mode*:string[std|pro|4K];multi_shots*:boolean;multi_prompt:array<object>;kling_elements:array<object,max 3>
- `kling/v3-turbo-text-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 2500);duration*:string;aspect_ratio*:string[1:1|9:16|16:9];resolution*:string[720p|1080p]
- `kling/v3-turbo-image-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 2500);image_urls*:array<string,max 1>;duration*:string;resolution*:string[720p|1080p]
- `kling-3.0-omni/reference-to-video`, `kling-3.0-omni/image-to-video`
  inputs: TOP.callBackUrl:string
- `kling-3.0-omni/transformation`
  inputs: TOP.callBackUrl:string;prompt:string(maxLen 3072);video_urls:array<string,max 1>;image_urls:array<string,max 4>;duration:string;resolution:string[720p|1080p|4k]="720p";aspect_ratio:string[16:9|9:16|1:1|auto]="16:9";audio:boolean[false|true];elements:array=[]<object>
- `kling-3.0-omni/text-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 3072);customize_multi_shots:boolean=false;prefer_multi_shots:boolean;multi_prompt:array=[]<object,max 6>;elements:array=[]<object>;audio:boolean=false;resolution:string[720p|1080p|4k]="720p";aspect_ratio:string[16:9|9:16|1:1]="16:9";duration:integer[3|4|5|6|7|8|9|10|11|12|13|14|15]=5(3..15)

## market/bytedance
- `bytedance/seedance-2`
  inputs: TOP.callBackUrl:string;prompt:string(maxLen 20000);first_frame_url:string;last_frame_url:string;reference_image_urls:array<string,max 9>;reference_video_urls:array<string,max 3>;reference_audio_urls:array<string,max 3>;return_last_frame:boolean=false;generate_audio:boolean=true;resolution:string[480p|720p|1080p|4k]="720p";aspect_ratio:string[1:1|4:3|3:4|16:9|9:16|21:9|adaptive]="16:9";duration:integer=5;web_search:boolean;nsfw_checker:boolean
- `bytedance/seedance-2-fast`
  inputs: TOP.callBackUrl:string;prompt:string(maxLen 20000);first_frame_url:string;last_frame_url:string;reference_image_urls:array<string,max 9>;reference_video_urls:array<string,max 3>;reference_audio_urls:array<string,max 3>;return_last_frame:boolean=false;generate_audio:boolean=true;resolution:string[480p|720p]="720p";aspect_ratio:string[1:1|4:3|3:4|16:9|9:16|21:9|adaptive]="16:9";duration:integer=5;web_search:boolean;nsfw_checker:boolean
- `bytedance/seedance-2-mini`
  inputs: TOP.callBackUrl:string;prompt:string(maxLen 20000);first_frame_url:string;last_frame_url:string;reference_image_urls:array<string,max 9>;reference_video_urls:array<string,max 3>;reference_audio_urls:array<string,max 3>;generate_audio:boolean=true;resolution:string[480p|720p]="720p";aspect_ratio:string[1:1|4:3|3:4|16:9|9:16|21:9|adaptive]="16:9";duration:integer=5;web_search:boolean;nsfw_checker:boolean
- `bytedance/seedance-2-5`
  inputs: TOP.callBackUrl:string;prompt:string(maxLen 20480);first_frame_url:string;last_frame_url:string;reference_image_urls:array<string,max 30>;reference_video_urls:array<string,max 10>;reference_audio_urls:array<string,max 10>;return_last_frame:boolean=false;generate_audio:boolean=true;resolution:string[480p|720p|1080p]="720p";aspect_ratio:string[1:1|4:3|3:4|16:9|9:16|21:9|adaptive]="adaptive";duration:integer=5;output_format:string[mp4|mov]="mp4";web_search:boolean;draft:boolean=false;nsfw_checker:boolean
- `bytedance/seedance-2-5-draft`
  inputs: TOP.callBackUrl:string;draft_task_id*:string;resolution*:string[1080p];output_format:string[mp4|mov];return_last_frame:boolean=false;nsfw_checker:boolean
- `bytedance/v1-pro-fast-image-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 10000);image_url*:string;resolution:string[720p|1080p]="720p";duration:string[5|10]="5";nsfw_checker:boolean
- `bytedance/v1-pro-image-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 10000);image_url*:string;resolution:string[480p|720p|1080p]="720p";duration:string[5|10]="5";camera_fixed:boolean;seed:number=-1(-1..2147483647);enable_safety_checker:boolean;nsfw_checker:boolean
- `bytedance/v1-pro-text-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 10000);aspect_ratio:string[21:9|16:9|4:3|1:1|3:4|9:16]="16:9";resolution:string[480p|720p|1080p]="720p";duration:string[5|10]="5";camera_fixed:boolean;seed:number=-1(-1..2147483647);enable_safety_checker:boolean;nsfw_checker:boolean
- `bytedance/v1-lite-image-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 10000);image_url*:string;resolution:string[480p|720p|1080p]="720p";duration:string[5|10]="5";camera_fixed:boolean;seed:number=-1(-1..2147483647);enable_safety_checker:boolean;end_image_url:string;nsfw_checker:boolean
- `bytedance/v1-lite-text-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 10000);aspect_ratio:string[16:9|4:3|1:1|3:4|9:16|9:21]="16:9";resolution:string[480p|720p|1080p]="720p";duration:string[5|10]="5";camera_fixed:boolean;seed:integer;enable_safety_checker:boolean;nsfw_checker:boolean

## market/hailuo
- `hailuo/2-3-image-to-video-pro`, `hailuo/2-3-image-to-video-standard`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_url*:string;duration*:string[6|10];resolution*:string[768P|1080P];nsfw_checker:boolean
- `hailuo/02-text-to-video-pro`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 1500);prompt_optimizer:boolean;nsfw_checker:boolean
- `hailuo/02-image-to-video-pro`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 1500);image_url*:string;end_image_url:string;prompt_optimizer:boolean;nsfw_checker:boolean
- `hailuo/02-text-to-video-standard`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 1500);duration*:string[6|10];prompt_optimizer:boolean;nsfw_checker:boolean
- `hailuo/02-image-to-video-standard`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 1500);image_url*:string;end_image_url:string;duration*:string[6|10];resolution*:string[512P|768P];prompt_optimizer:boolean;nsfw_checker:boolean

## market/infinitalk
- `infinitalk/from-audio`
  inputs: TOP.callBackUrl:string;image_url*:string;audio_url*:string;prompt*:string(maxLen 5000);resolution:string[480p|720p]="480p";seed:number

## market/pixverse
- `pixverse-v6/text-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);aspect_ratio*:string[16:9|4:3|1:1|3:4|9:16|2:3|3:2|21:9];quality*:string[360p|540p|720p|1080p];duration*:integer(1..15);generate_audio_switch:boolean=false;generate_multi_clip_switch:boolean=false;seed:integer(0..2147483647)
- `pixverse-v6/image-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_urls*:array<string,max 2>;quality*:string[360p|540p|720p|1080p];duration*:integer(1..15);generate_audio_switch:boolean=false;generate_multi_clip_switch:boolean=false;seed:integer(0..2147483647);template_id:string[412736208886848|411563216524736|411316927927040|411174903569216|410999246341952|408891141511104|410317363057408|410285445698304|410133101388544|409899296377728|408897485909952|408869061406656|408661207662528|409767750265728|409766559675264|409589071559552|407804339389760|407658863287616|407474361215744|407473438360320|407467702283008|385844572217469|406428904874432|406423682060736|406411724685760|406372274350528|406218913317312|406218479198656|406064763308480|406413607395776|405662117814720|406014934000064|405658369331648|405321470423488|405175211454656|404955806201792|404820147974080|398980393937856|403916646846400|403739217192896|403560060358144|403556618212098|398965022284579|402201060373270|403085292466285|402061828030966|402888569901524|402155676592228|402047865383360|402046136040202]
- `pixverse-v6/transition`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);first_frame_image_url*:string;last_frame_image_url*:string;quality*:string[360p|540p|720p|1080p];duration*:integer(1..15);generate_audio_switch:boolean=false;seed:integer(0..2147483647)
- `pixverse-v6/extend`
  inputs: TOP.callBackUrl:string
- `pixverse-v6/reference-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);image_references*:array<object,max 7>;aspect_ratio*:string[16:9|4:3|1:1|3:4|9:16|2:3|3:2|21:9];quality*:string[360p|540p|720p|1080p];duration*:integer(1..15);generate_audio_switch:boolean=false;seed:integer(0..2147483647)

## market/minimax-h3
- `minimax-h3/text-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 7000);aspect_ratio*:string[21:9|16:9|4:3|1:1|3:4|9:16];duration*:integer[4|5|6|7|8|9|10|11|12|13|14|15]=6(4..15);resolution:string[768P|2K]="2K"
- `minimax-h3/image-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 7000);first_frame_url:string;last_frame_url:string;duration*:integer[4|5|6|7|8|9|10|11|12|13|14|15]=6(4..15);resolution:string[768P|2K]="2K"
- `minimax-h3/reference-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 7000);reference_image_urls:array<string,max 9>;reference_video_urls:array<string,max 3>;reference_audio_urls:array<string,max 3>;aspect_ratio:string[adaptive|21:9|16:9|4:3|1:1|3:4|9:16]="adaptive";duration*:integer[4|5|6|7|8|9|10|11|12|13|14|15]=6(4..15);resolution:string[768P|2K]="2K"

## runway-api/generate-aleph-video.md
- `runway/gen4-aleph`
  inputs: TOP.callBackUrl:string;prompt*:string;video_url*:string;watermark:string;upload_cn:boolean=false;aspect_ratio:string[16:9|9:16|4:3|3:4|1:1|21:9];seed:integer;reference_image:string

## runway-api/generate-ai-video.md
- `runway`
  inputs: TOP.callBackUrl:string;prompt*:string;image_url:string;duration*:number;quality*:string;aspect_ratio:string[16:9|4:3|1:1|3:4|9:16];watermark:string

## runway-api/extend-ai-video.md
- `runway/extend-ai-video`
  inputs: TOP.callBackUrl:string;task_id*:string;prompt*:string;quality*:string;watermark:string

## market/happyhorse
- `happyhorse/text-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);resolution:string[720p|1080p]="1080p";aspect_ratio:string[16:9|9:16|1:1|4:3|3:4]="16:9";duration:integer=5(3..15);seed:integer=0(0..2147483647)
- `happyhorse/image-to-video`
  inputs: TOP.callBackUrl:string;prompt:string(maxLen 5000);image_urls*:array<string,max 1>;resolution:string[720p|1080p]="1080p";duration:integer=5(3..15);seed:integer=0(0..2147483647)
- `happyhorse/reference-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);reference_image*:array<string,max 9>;resolution:string[720p|1080p]="1080p";aspect_ratio:string[16:9|9:16|1:1|4:3|3:4]="16:9";duration:integer=5(3..15);seed:integer=0(0..2147483647)
- `happyhorse/video-edit`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);video_url*:string;reference_image:array<string,max 5>;resolution:string[720p|1080p]="1080p";audio_setting:string[auto|origin]="auto";seed:integer=0(0..2147483647)

## market/happyhorse-1-1
- `happyhorse-1-1/image-to-video`
  inputs: TOP.callBackUrl:string;prompt:string=""(maxLen 5000);image_urls*:array<string,max 1>;resolution:string[720p|1080p]="1080p";duration:number=5(3..15)
- `happyhorse-1-1/text-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);resolution:string[720p|1080p]="1080p";aspect_ratio:string[16:9|9:16|1:1|4:3|3:4|4:5|5:4|9:21|21:9]="16:9";duration:number=5(3..15)
- `happyhorse-1-1/reference-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 5000);reference_image*:array<string,max 9>;resolution:string[720p|1080p]="1080p";aspect_ratio:string[16:9|9:16|3:4|4:3|4:5|5:4|1:1|9:21|21:9]="16:9";duration:number=5(3..15)

## market/gemini-omni-video.md
- `gemini-omni-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 20000);image_urls:array<string>;audio_ids:array<string>;video_list:array<object>;character_ids:array<string>;duration*:string[4|6|8|10];aspect_ratio:string[16:9|9:16];resolution:string[720p|1080p|4k]="720p";seed:integer

## market/omnihuman-1-5.md
- `omnihuman-1-5`
  inputs: image_url*:string;mask_url:array<string,max 5>;audio_url*:string;prompt:string(maxLen 300);output_resolution:string[720|1080]="1080";pe_fast_mode:boolean=false;seed:integer=-1;TOP.callBackUrl:string

## market/omnihuman-1-5
- `omnihuman-1-5/human-identification`, `omnihuman-1-5/subject-detection`
  inputs: image_url*:string;TOP.callBackUrl:string

## market/volcengine
- `volcengine/video-to-video-lip-sync`
  inputs: mode*:string[lite|basic];video_url*:string;audio_url*:string;separate_vocal:boolean=false;open_scenedet:boolean=false;align_audio:boolean=true;align_audio_reverse:boolean=false;templ_start_seconds:number=0;TOP.callBackUrl:string

## veo3-api/generate-veo-3-video.md
- `veo-3-1`
  inputs: TOP.callBackUrl:string;prompt*:string;model:string[veo3_fast|veo3_lite|veo3]="veo3_fast";image_urls:array<string>;generation_type:string[TEXT_2_VIDEO|FIRST_AND_LAST_FRAMES_2_VIDEO|REFERENCE_2_VIDEO];aspect_ratio:string[16:9|9:16|Auto]="16:9";enable_fallback:boolean=false;enable_translation:boolean;watermark:string;resolution:string[720p|1080p|4k]="720p";duration:integer[4|6|8]=8

## veo3-api/get-veo-3-4k-video.md
- `veo/get-4k-video`
  inputs: TOP.callBackUrl:string;task_id*:string;index:integer=0

## veo3-api/extend-video.md
- `veo/extend`
  inputs: TOP.callBackUrl:string;task_id*:string;prompt*:string;seeds:integer(10000..99999);model:string[fast|quality|lite]="fast";watermark:string

## market/vidu-q4
- `vidu-q4/image-to-video`
  inputs: TOP.callBackUrl:string;prompt:string(maxLen 20000);duration:integer=5(3..16);resolution:string[540p|720p|1080p|2k|4k]="720p";audio:boolean=true;image_url*:string
- `vidu-q4/reference-to-video`
  inputs: TOP.callBackUrl:string;prompt*:string(maxLen 20000);duration:integer=5(3..16);resolution:string[540p|720p|1080p|2k|4k]="720p";audio:boolean=true;reference_image_urls*:array<string,max 15>;reference_audio_urls:array<string,max 3>;aspect_ratio:string[16:9|9:16|1:1|4:3|3:4]="16:9"

