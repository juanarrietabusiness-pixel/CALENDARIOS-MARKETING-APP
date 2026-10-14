# Kie.ai: modelos de video

Extracto de la documentación de Kie.ai (docs.kie.ai) que entregó la agencia el 14-10-2026: sólo los modelos que usa o va a usar el Estudio. La original completa no está en el repositorio.

# Video Models > Kling > Kling 3.0
Fuente: https://docs.kie.ai/market/kling/kling-3-0.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Kling 3.0
      description: >-
        Generate high-quality videos with advanced multi-shot capabilities and
        element references using Kling 3.0 AI 

        ## Overview

        Kling 3.0 is an advanced video generation model that supports both
        single-shot and multi-shot video creation with element references. It
        offers three modes: std, pro and 4K, with different resolution options,
        and supports sound effects for enhanced video output.

        ## Key Features

        - **Multiple Generation Modes**: Choose between `std` (standard
        resolution), `pro` (higher resolution), and `4K` (ultra-high resolution)
        modes

        - **Multi-Shot Support**: Create videos with multiple shots, each with
        its own prompt and duration

        - **Element Reference**: Use the `@element_name` syntax to reference
        image/video/audio elements within prompts

        - **Native Audio**: Speech, sound effects and ambience

        - **Flexible Aspect Ratios**: Support for 16:9, 9:16, and 1:1 aspect
        ratios

        - **Configurable Duration**: Video duration from 3 to 15 seconds

        :::tip

        In std and pro modes, enabling sound costs more. In multi-shot mode,
        billing is based on the sum of the shot durations. For current prices,
        see [kie.ai/pricing](https://kie.ai/pricing).

        :::

        ## Resolution Mappings

        The resolution depends on both the `mode` and `aspect_ratio` parameters:

        <Tabs groupId="mode">

        <TabItem value="std" label="Standard Mode (std)">

        | Aspect Ratio | Resolution |

        |--------------|------------|

        | 16:9         | 1280×720   |

        | 9:16         | 720×1280   |

        | 1:1          | 720×720    |

        </TabItem>

        <TabItem value="pro" label="Pro Mode (pro)">

        | Aspect Ratio | Resolution |

        |--------------|------------|

        | 16:9         | 1920×1080  |

        | 9:16         | 1080×1920  |

        | 1:1          | 1440×1440  |

        </TabItem>

        <TabItem value="4K" label="4K Mode (4K)">

        | Aspect Ratio | Resolution |

        |--------------|------------|

        | 16:9         | 3840×2160  |

        | 9:16         | 2160×3840  |

        | 1:1          | 2160×2160  |

        </TabItem>

        </Tabs>

        :::info[]

        4K mode provides higher resolution output but may take longer to
        generate and consume more credits.

        :::

        ## Single-Shot vs Multi-Shot Mode

        ### Single-Shot Mode (`multi_shots: false`)

        - Uses the main `prompt` field for video generation

        - Supports first and last frame images via `image_urls`

        - Sound effects are optional

        ### Multi-Shot Mode (`multi_shots: true`)

        - Uses `multi_prompt` array to define multiple shots

        - Each shot has its own prompt and duration (1-12 seconds)

        - Only supports first frame image (via `image_urls[0]`)

        - The maximum number of characters per shot is 500

        ## Aspect Ratio Auto-Adaptation

        When you provide `image_urls` (first and/or last frame images), the
        `aspect_ratio` parameter becomes optional. The system will automatically
        adapt the aspect ratio based on the uploaded images, so you don't need
        to specify it manually.

        :::tip[]

        If you upload reference images, you can omit the `aspect_ratio`
        parameter and let the system automatically match the aspect ratio of
        your images.

        :::

        ## Element References

        You can reference element in your prompts using the `@element_name`
        syntax. Define elements in the `kling_elements` array:

        - **Image Elements**: 2-4 image URLs (JPG/PNG, max 10MB each)

        - **Video Elements**: Up to 1 video URL (MP4/MOV format, the video
        duration must be at least 3 seconds, and the effective segment length
        should be between 3 and 8 seconds)

        - **Audio Reference**: Up to 1 audio URL (audio duration must be between
        5 and 30 seconds)

        :::tip[]

        Use descriptive element names and ensure the element name in
        `kling_elements` matches the name used in your prompt (without the @
        symbol).

        A single task can reference a maximum of 3 elements, and each `@element`
        will occupy 37 characters.

        :::

        ## File Upload Requirements

        Before using element references, upload your image  files:

        ### 1. Upload Files

        Use the File Upload API to upload your source images.

        :::info[File Upload API]

        Learn how to upload files and get file URLs: [File Upload API
        Quickstart](/file-upload-api/quickstart)

        :::

        ### 2. Get File URLs

        After upload, you'll receive file URLs that you can use in
        `element_input_urls` and `element_input_audio_urls`.

        :::caution[]

        - formats: 
            - Image (JPG, PNG, max 10MB per file, 2-4 files per element)
            - Video (MP4, MOV format. Video duration should be at least 3 seconds. The effective video segment length should be between 3 and 8 seconds)
            - Audio (Audio duration must be between 5 and 30 seconds)
        - Ensure file URLs are accessible and not expired

        :::

        ## Usage Examples

        ### Single-Shot Video with Element Reference

        ```json

        {
          "model": "kling-3.0/video",
          "input": {
            "prompt": "In a bright rehearsal room, sunlight streams through the window@element_dog",
            "image_urls": [
              "https://static.aiquickdraw.com/tools/example/1764851002741_i0lEiI8I.png"
            ],
            "sound": false,
            "duration": "5",
            "aspect_ratio": "16:9",
            "mode": "std",
            "multi_shots": false,
            "kling_elements": [
              {
                "name": "element_dog",
                "description": "dog",
                "element_input_urls": [
                  "https://example.com/your-image.png",
                  "https://example.com/your-image.png"
                ]
              }
            ]
          }
        }

        ```

        ### Multi-Shot Video

        ```json

        {
          "model": "kling-3.0/video",
          "input": {
            "multi_shots": true,
            "image_urls": [
              "https://static.aiquickdraw.com/tools/example/1764851002741_i0lEiI8I.png"
            ],
            "sound": false,
            "duration": "5",
            "aspect_ratio": "16:9",
            "mode": "std",
            "multi_prompt": [
              {
                "prompt": "a happy dog in running@element_cat",
                "duration": 2
              },
              {
                "prompt": "a happy dog play with a cat@element_dog",
                "duration": 3
              }
            ],
            "kling_elements": [
              {
                "name": "element_cat",
                "description": "cat",
                "element_input_urls": [ "https://example.com/your-image.png",    "https://example.com/your-image.png"
                ]
              },
              {
                "name": "element_dog",
                "description": "dog",
                "element_input_urls": [ "https://example.com/your-image.png",    "https://example.com/your-image.png"
                ]
              }
            ]
          }
        }

        ```

        ## Query Task Status

        After submitting a task, use the unified query endpoint to check
        progress and retrieve results:

        :::tip[Get Task Details]

        Learn how to query task status and retrieve generation results: [Get
        Task Details](/market/common/get-task-detail)

        :::

        :::tip[]

        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.

        :::

        ## Best Practices

        - **Prompt Writing**: Be specific and descriptive in your prompts.
        Include details about motion, camera angles, and scene composition

        - **Element Usage**: Use high-quality reference images/video/audio for
        better results. Ensure elements match the style and theme of your video

        - **Duration Planning**: For multi-shot videos, plan your shot durations
        to match the total video duration

        - **Mode Selection**: Use `4K` mode for final output when quality is
        important, and `std` mode for faster iterations

        - **Sound Effects**: Enable sound effects for more immersive videos,
        especially for action or dynamic scenes

        ## Related Resources

        
          
        </CardGroup>
      operationId: kling-3.0
      tags:
        - docs/en/Market/Video Models/Kling
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
              properties:
                model:
                  type: string
                  enum:
                    - kling-3.0/video
                  default: kling-3.0/video
                  description: The model name. Must be kling-3.0/video.
                  examples:
                    - kling-3.0/video
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.

                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the generation task
                  properties:
                    prompt:
                      type: string
                      description: >-
                        Required when multi_shots is false. Up to 2,500
                        characters.
                      examples:
                        - >-
                          In a bright rehearsal room, sunlight streams through
                          the window@element_dog
                    image_urls:
                      type: array
                      items:
                        type: string
                        format: uri
                      description: >-
                        First and last frame image URLs. Optional; not required
                        when using kling_elements. When multi_shots is false: if
                        length is 2, index 0 is the first frame and index 1 is
                        the last frame; if length is 1, the array item serves as
                        the first frame. When multi_shots is true: only the
                        first frame is supported.
                      examples:
                        - - >-
                            https://static.aiquickdraw.com/tools/example/1764851002741_i0lEiI8I.png
                    sound:
                      type: boolean
                      description: >-
                        Required. Whether to generate audio (speech, sound
                        effects, ambience) with the video. Affects price.
                      examples:
                        - true
                    duration:
                      type: string
                      description: >-
                        Required. Video duration in seconds, 3–15 (string, e.g.
                        "5"). In multi-shot mode, output length and billing
                        follow the sum of multi_prompt[].duration (3–15 s); set
                        duration to the same total.
                      enum:
                        - '3'
                        - '4'
                        - '5'
                        - '6'
                        - '7'
                        - '8'
                        - '9'
                        - '10'
                        - '11'
                        - '12'
                        - '13'
                        - '14'
                        - '15'
                      examples:
                        - '5'
                    aspect_ratio:
                      type: string
                      description: >-
                        Optional when image_urls is provided (the output follows
                        the first frame's aspect ratio). For text-to-video, set
                        it explicitly: 16:9, 9:16 or 1:1.
                      enum:
                        - '16:9'
                        - '9:16'
                        - '1:1'
                      examples:
                        - '16:9'
                    mode:
                      type: string
                      description: >-
                        Required. Generation mode. std has standard resolution,
                        pro has higher resolution, 4K has 4K resolution.

                        Resolution mapping:

                        - **std mode**: 16:9 (1280×720), 9:16 (720×1280), 1:1
                        (720×720)

                        - **pro mode**: 16:9 (1920×1080), 9:16 (1080×1920), 1:1
                        (1080×1080)

                        - **4K mode**: 16:9 (3840×2160), 9:16 (2160×3840), 1:1
                        (2160×2160)
                      enum:
                        - std
                        - pro
                        - 4K
                      examples:
                        - pro
                                                name: ''
                          description: ''
                        - value: pro
                          name: ''
                          description: ''
                        - value: 4K
                          name: ''
                          description: ''
                    multi_shots:
                      type: boolean
                      description: >-
                        Required. Whether to use multi-shot mode. true enables
                        multi-shot mode, false enables single-shot mode.
                      examples:
                        - false
                    multi_prompt:
                      type: array
                      description: >-
                        Shot prompts. Takes effect when multi_shots is true.
                        Used to describe the text and duration of each shot.
                        Supports up to 5 shots. Each shot duration is 1-12
                        seconds. If you need to use elements, add them after the
                        prompt.
                      items:
                        type: object
                        properties:
                          prompt:
                            type: string
                            description: >-
                              Prompt text for this shot, a maximum of 500
                              characters per shot. Each @element will occupy 37
                              characters.
                            examples:
                              - a happy dog in running@element_cat
                            maxLength: 500
                          duration:
                            type: integer
                            description: 'Duration of this shot in seconds. Range: 1-12.'
                            minimum: 1
                            maximum: 12
                            examples:
                              - 3
                        required:
                          - prompt
                          - duration
                                                                      examples:
                        - - prompt: a happy dog in running@element_cat
                            duration: 3
                          - prompt: a happy dog play with a cat@element_dog
                            duration: 3
                    kling_elements:
                      type: array
                      items:
                        type: object
                        properties:
                          name:
                            type: string
                            description: >-
                              Element name, used in prompt with @ prefix (e.g.,
                              @element_dog)
                            examples:
                              - element_dog
                          description:
                            type: string
                            description: Element description
                            examples:
                              - dog
                          element_input_urls:
                            type: array
                            items:
                              type: string
                              format: uri
                            description: >-
                              Either 2–4 images (JPG/PNG, up to 10 MB each) or 1
                              video (MP4/MOV).
                            examples:
                              - - https://example.com/your-image.png
                                - https://example.com/your-image.png
                          element_input_audio_urls:
                            type: array
                            items:
                              type: string
                              format: uri
                            description: >-
                              Optional. List of audio material URLs for
                              characters. The audio duration must be between 5
                              and 30 seconds.
                          start_time:
                            type: integer
                            description: >-
                              Start time for video character material capture
                              (in milliseconds). Only effective when uploading
                              videos through element_input_urls. If not
                              uploaded, it defaults to 0.
                          end_time:
                            type: integer
                            description: >-
                              End time for video character material capture (in
                              milliseconds). Only effective when uploading
                              videos through element_input_urls. Must be greater
                              than start_time, and the difference between
                              end_time and start_time must be within 3000 to
                              8000 milliseconds.
                        required:
                          - name
                          - description
                          - element_input_urls
                                                                      description: >-
                        Referenced elements. Detailed information about elements
                        referenced in the prompt. A single task can reference a
                        maximum of three elements.
                      examples:
                        - - name: element_dog
                            description: dog
                            element_input_urls:
                              - https://example.com/your-image.png
                              - https://example.com/your-image.png
                      maxItems: 3
                  required:
                    - sound
                    - duration
                    - mode
                    - multi_shots
                                                                            example:
              model: kling-3.0/video
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  In a bright rehearsal room, sunlight streams through the
                  window @element_dog
                image_urls:
                  - >-
                    https://static.aiquickdraw.com/tools/example/1764851002741_i0lEiI8I.png
                sound: true
                duration: '5'
                aspect_ratio: '16:9'
                mode: pro
                multi_shots: false
                multi_prompt:
                  - prompt: a happy dog in running @element_cat
                    duration: 3
                  - prompt: a happy dog play with a cat @element_dog
                    duration: 2
                kling_elements:
                  - name: element_dog
                    description: dog
                    element_input_urls:
                      - https://example.com/your-image.png
                      - https://example.com/your-image.png
                    element_input_audio_urls:
                      - https://your-cdn.com/wjeoiajfosijfoi.mp3
                  - name: element_cat
                    description: cat
                    element_input_urls:
                      - https://your-cdn.com/element_image.mp4
                    element_input_audio_urls:
                      - https://your-cdn.com/wjeoiajfosijfoi.mp3
                    start_time: 0
                    end_time: 8000

=====

# Video Models > Kling > Kling 3.0 Omni Reference To Video
Fuente: https://docs.kie.ai/market/kling/v3-omni-reference-to-video.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Kling 3.0 Omni Reference To Video
      description: >-
        ## Query Task Status

        After submitting a task, you can check the task progress and retrieve
        generation results via the unified query endpoint:

        

        ::: tip[]

        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: kling-3.0-omni-reference-to-video
      tags:
        - docs/en/Market/Video Models/Kling
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  enum:
                    - kling-3.0-omni/reference-to-video
                  default: kling-3.0-omni/reference-to-video
                  description: >-
                    The name of the model used to generate the task. This field
                    is required.

                    - This endpoint requires the
                    `kling-3.0-omni/reference-to-video` model
                  examples:
                    - kling-3.0-omni/reference-to-video
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.

                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  description: >-
                    Input parameters for the generation task. Rules: (1)
                    customize_multi_shots and prefer_multi_shots cannot both be
                    true; (2) customize_multi_shots = true requires 1–6
                    multi_prompt shots (each 1–12 s, total ≤ 15 s); (3)
                    otherwise omit multi_prompt.
                  oneOf:
                    - title: No Video Input
                      type: object
                      required:
                        - prompt
                        - image_urls
                      properties:
                        prompt:
                          type: string
                          minLength: 1
                          maxLength: 3072
                          description: >-
                            Video description. It must not be empty after
                            leading and trailing whitespace is removed. Maximum
                            length: 3,072 characters.
                          examples:
                            - >-
                              Generate a video of the character walking along a
                              city street, using the character appearance in the
                              reference images.
                        image_urls:
                          type: array
                          description: >-
                            Array of reference image URLs. The maximum number of
                            images depends on the number and types of reference
                            subjects. When there is no reference video and only
                            multi-image subjects are used, the combined number
                            of reference images and multi-image subjects must
                            not exceed 7. When there is no reference video and
                            both video character and multi-image subjects are
                            used, the combined number of reference images and
                            multi-image subjects must not exceed 4. HTTP, HTTPS,
                            and OSS URLs are supported. Images must be in JPG,
                            JPEG, or PNG format; each file must not exceed 50
                            MB; both width and height must be at least 300 px;
                            and the aspect ratio must be between 0.4 and 2.5.
                          maxItems: 7
                          items:
                            type: string
                            format: uri
                            pattern: ^(https?|oss)://
                          examples:
                            - - https://example.com/reference-image.jpg
                        duration:
                          type: integer
                          description: >-
                            Total video duration in seconds. Optional; the
                            default is 5 seconds. Supports integer values from 3
                            to 15.
                          enum:
                            - 3
                            - 4
                            - 5
                            - 6
                            - 7
                            - 8
                            - 9
                            - 10
                            - 11
                            - 12
                            - 13
                            - 14
                            - 15
                          default: 5
                          minimum: 3
                          maximum: 15
                          examples:
                            - 5
                        resolution:
                          type: string
                          description: >-
                            Video resolution. `720p` outputs a 720p video,
                            `1080p` outputs a 1080p video, and `4k` outputs a 4K
                            video.
                          enum:
                            - 720p
                            - 1080p
                            - 4k
                          default: 720p
                          examples:
                            - 720p
                        aspect_ratio:
                          type: string
                          description: >-
                            When no video is provided, `16:9`, `9:16`, and `1:1`
                            are supported.
                          enum:
                            - '16:9'
                            - '9:16'
                            - '1:1'
                          default: '16:9'
                          examples:
                            - '16:9'
                        audio:
                          type: boolean
                          description: >-
                            Whether to enable audio. When no video is provided,
                            both `true` and `false` are supported.
                          examples:
                            - true
                        customize_multi_shots:
                          type: boolean
                          description: >-
                            Optional, default false. Set true for custom
                            multi-shot (multi_prompt required).
                          examples:
                            - true
                          default: false
                        prefer_multi_shots:
                          type: boolean
                          description: >-
                            Whether to enable intelligent shot planning. This
                            field is mutually exclusive with
                            `customize_multi_shots`.
                          examples:
                            - true
                        multi_prompt:
                          type: array
                          description: >-
                            List of custom shots. When
                            `customize_multi_shots=true`, this field is
                            required, must not be empty, and may contain up to 6
                            shots. When `customize_multi_shots=false`, it must
                            be an empty array or omitted.
                          minItems: 1
                          maxItems: 6
                          items:
                            type: object
                            required:
                              - prompt
                              - duration
                            properties:
                              prompt:
                                type: string
                                minLength: 1
                                maxLength: 512
                                description: >-
                                  Video description for the current shot.
                                  Maximum length: 512 characters.
                              duration:
                                type: integer
                                minimum: 1
                                maximum: 12
                                description: >-
                                  Duration of this shot in seconds, 1–12. The
                                  sum of all shots must not exceed 15.
                                                                                elements:
                          type: array
                          description: >-
                            List of one-time subject assets. The default is an
                            empty array. The number of subjects is jointly
                            limited by the reference images, reference video,
                            and subject types. When there is no reference video
                            and only multi-image subjects are used, the combined
                            number of reference images and multi-image subjects
                            must not exceed 7. When there is no reference video
                            and only video character subjects are used, the
                            number of video character subjects must not exceed
                            3. When there is no reference video and both video
                            character and multi-image subjects are used, the
                            number of video character subjects must not exceed
                            3, and the combined number of reference images and
                            multi-image subjects must not exceed 4.
                          default: []
                          items:
                            type: object
                            required:
                              - name
                              - description
                              - element_input_urls
                            properties:
                              name:
                                type: string
                                description: >-
                                  Subject name. It must be unique within the
                                  same request and can be referenced in the
                                  prompt using `@name`.
                                examples:
                                  - element_dog
                              description:
                                type: string
                                description: Subject description.
                                examples:
                                  - A happy golden retriever
                              element_input_urls:
                                type: array
                                description: >-
                                  URLs of the subject image or video assets.
                                  Provide 1 to 4 URLs.
                                minItems: 1
                                maxItems: 4
                                items:
                                  type: string
                                  format: uri
                                  pattern: ^(https?|oss)://
                              element_input_audio_urls:
                                type: array
                                description: >-
                                  Optional list of subject reference audio URLs.
                                  If the duration can be determined, it must be
                                  between 5 and 30 seconds.
                                default: []
                                items:
                                  type: string
                                  format: uri
                                  pattern: ^(https?|oss)://
                              start_time:
                                type: integer
                                description: >-
                                  Start time for trimming the video character
                                  subject, in milliseconds. The default is 0.
                                default: 0
                              end_time:
                                type: integer
                                description: >-
                                  End time for trimming the video character
                                  subject, in milliseconds. The default is
                                  8,000.
                                default: 8000
                                                                              allOf:
                        - type: string
                        - type: string
                      additionalProperties: false
                                                                  type: object
                      required:
                        - prompt
                        - video_urls
                        - aspect_ratio
                        - audio
                      properties:
                        prompt:
                          type: string
                          minLength: 1
                          maxLength: 3072
                          description: >-
                            Video description. It must not be empty after
                            leading and trailing whitespace is removed. Maximum
                            length: 3,072 characters.
                          examples:
                            - >-
                              Generate natural, smooth shot transitions based on
                              the input video.
                        video_urls:
                          type: array
                          description: >-
                            Array of video URLs. Exactly 1 video is required.
                            HTTP, HTTPS, and OSS URLs are supported. Videos must
                            be in MP4 or MOV format; each file must not exceed
                            200 MB; duration must be between 3 and 15.5 seconds;
                            width and height must each be between 700 and 4,553
                            px; total pixels must not exceed 8,294,400; the
                            aspect ratio must be between 0.4 and 2; and the
                            frame rate must be between 24 and 60 fps.
                          minItems: 1
                          maxItems: 1
                          items:
                            type: string
                            format: uri
                            pattern: ^(https?|oss)://
                          examples:
                            - - https://example.com/reference-video.mp4
                        resolution:
                          type: string
                          description: >-
                            Video resolution. `720p` outputs a 720p video,
                            `1080p` outputs a 1080p video, and `4k` outputs a 4K
                            video.
                          enum:
                            - 720p
                            - 1080p
                            - 4k
                          default: 720p
                          examples:
                            - 720p
                        aspect_ratio:
                          type: string
                          description: Only `auto` can be used with video-only input.
                          enum:
                            - auto
                          default: auto
                          examples:
                            - auto
                        audio:
                          type: boolean
                          description: >-
                            No audio is generated when a video is provided; set
                            false.
                          const: false
                          examples:
                            - false
                        elements:
                          type: array
                          items:
                            type: object
                            required:
                              - name
                              - description
                              - element_input_urls
                            properties:
                              name:
                                type: string
                                description: >-
                                  Subject name. It must be unique within the
                                  same request and can be referenced in the
                                  prompt using `@name`.
                                examples:
                                  - element_dog
                              description:
                                type: string
                                description: Subject description.
                                examples:
                                  - A happy golden retriever
                              element_input_urls:
                                type: array
                                description: >-
                                  URLs of the subject image or video assets.
                                  Provide 1 to 4 URLs.
                                minItems: 1
                                maxItems: 4
                                items:
                                  type: string
                                  format: uri
                                  pattern: ^(https?|oss)://
                              element_input_audio_urls:
                                type: array
                                description: >-
                                  Optional list of subject reference audio URLs.
                                  If the duration can be determined, it must be
                                  between 5 and 30 seconds.
                                default: []
                                items:
                                  type: string
                                  format: uri
                                  pattern: ^(https?|oss)://
                              start_time:
                                type: integer
                                description: >-
                                  Start time for trimming the video character
                                  subject, in milliseconds. The default is 0.
                                default: 0
                              end_time:
                                type: integer
                                description: >-
                                  End time for trimming the video character
                                  subject, in milliseconds. The default is
                                  8,000.
                                default: 8000
                                                                                  description: >-
                            List of one-time subject assets. The number of
                            subjects is jointly limited by the reference images,
                            reference video, and subject types.

                            - When a reference video and only multi-image
                            subjects are used, the combined number of reference
                            images and multi-image subjects must not exceed 4.

                            - When a reference video and only video character
                            subjects are used, the number of video character
                            subjects must not exceed 1.

                            - When a reference video is provided, video
                            character subjects cannot be used together with
                            multi-image subjects or reference images.
                          default: []
                      additionalProperties: false
                                                                  properties:
                        prompt:
                          type: string
                          minLength: 1
                          maxLength: 3072
                          description: >-
                            Video description. It must not be empty after
                            leading and trailing whitespace is removed. Maximum
                            length: 3,072 characters.
                          examples:
                            - >-
                              Generate a video of the character walking along a
                              city street, using the character shown in the
                              reference video and images.
                        image_urls:
                          type: array
                          description: >-
                            Array of reference image URLs. The maximum number of
                            images depends on the number and types of reference
                            subjects.
                                When only multi-image subjects are used, the combined number of reference images and multi-image subjects must not exceed 4.
                                Video character subjects cannot be used together with multi-image subjects or reference images.
                            HTTP, HTTPS, and OSS URLs are supported. Images must
                            be in JPG, JPEG, or PNG format; each file must not
                            exceed 50 MB; both width and height must be at least
                            300 px; and the aspect ratio must be between 0.4 and
                            2.5.
                          maxItems: 4
                          items:
                            type: string
                            format: uri
                            pattern: ^(https?|oss)://
                          examples:
                            - - https://example.com/reference-image.jpg
                        video_urls:
                          type: array
                          description: >-
                            Array of video URLs. Exactly 1 video is required.
                            HTTP, HTTPS, and OSS URLs are supported. Videos must
                            be in MP4 or MOV format; each file must not exceed
                            200 MB; duration must be between 3 and 15.5 seconds;
                            width and height must each be between 700 and 4,553
                            px; total pixels must not exceed 8,294,400; the
                            aspect ratio must be between 0.4 and 2; and the
                            frame rate must be between 24 and 60 fps.
                          minItems: 1
                          maxItems: 1
                          items:
                            type: string
                            format: uri
                            pattern: ^(https?|oss)://
                          examples:
                            - - https://example.com/reference-video.mp4
                        duration:
                          type: integer
                          description: >-
                            Total video duration in seconds. Optional; the
                            default is 5 seconds. Supports integer values from 3
                            to 15.
                          enum:
                            - 3
                            - 4
                            - 5
                            - 6
                            - 7
                            - 8
                            - 9
                            - 10
                            - 11
                            - 12
                            - 13
                            - 14
                            - 15
                          default: 5
                          minimum: 3
                          maximum: 15
                          examples:
                            - 5
                        resolution:
                          type: string
                          description: >-
                            Video resolution. `720p` outputs a 720p video,
                            `1080p` outputs a 1080p video, and `4k` outputs a 4K
                            video.
                          enum:
                            - 720p
                            - 1080p
                            - 4k
                          default: 720p
                          examples:
                            - 720p
                        aspect_ratio:
                          type: string
                          description: Video aspect ratio.
                          enum:
                            - '16:9'
                            - '9:16'
                            - '1:1'
                          default: '16:9'
                                                        name: '16:9'
                              description: ''
                            - value: '9:16'
                              name: '9:16'
                              description: ''
                            - value: '1:1'
                              name: '1:1'
                              description: ''
                          examples:
                            - '16:9'
                        audio:
                          type: boolean
                          description: >-
                            No audio is generated when a video is provided; set
                            false.
                          const: false
                          examples:
                            - false
                        elements:
                          type: array
                          items:
                            type: object
                            required:
                              - name
                              - description
                              - element_input_urls
                            properties:
                              name:
                                type: string
                                description: >-
                                  Subject name. It must be unique within the
                                  same request and can be referenced in the
                                  prompt using `@name`.
                                examples:
                                  - element_dog
                              description:
                                type: string
                                description: Subject description.
                                examples:
                                  - A happy golden retriever
                              element_input_urls:
                                type: array
                                description: >-
                                  URLs of the subject image or video assets.
                                  Provide 1 to 4 URLs.
                                minItems: 1
                                maxItems: 4
                                items:
                                  type: string
                                  format: uri
                                  pattern: ^(https?|oss)://
                              element_input_audio_urls:
                                type: array
                                description: >-
                                  Optional list of subject reference audio URLs.
                                  If the duration can be determined, it must be
                                  between 5 and 30 seconds.
                                default: []
                                items:
                                  type: string
                                  format: uri
                                  pattern: ^(https?|oss)://
                              start_time:
                                type: integer
                                description: >-
                                  Start time for trimming the video character
                                  subject, in milliseconds. The default is 0.
                                default: 0
                              end_time:
                                type: integer
                                description: >-
                                  End time for trimming the video character
                                  subject, in milliseconds. The default is
                                  8,000.
                                default: 8000
                                                                                  description: >-
                            List of one-time subject assets. When a reference
                            video and only multi-image subjects are used, the
                            combined number of reference images and multi-image
                            subjects must not exceed 4. When a reference video
                            and only video character subjects are used, the
                            number of video character subjects must not exceed
                            1. When a reference video is provided, video
                            character subjects cannot be used together with
                            multi-image subjects or reference images.

                            Note: This field is unavailable when video input is
                            provided and `customize_multi_shots=false` (it must
                            be an empty array or omitted).
                          default: []
                                            title: Video with Images
                      required:
                        - prompt
                        - image_urls
                        - video_urls
                        - audio
                      allOf:
                        - type: string
                        - type: string
                      additionalProperties: false
                                                  examples:
                - model: kling-3.0-omni/reference-to-video
                  callBackUrl: https://your-domain.com/api/callback
                  input:
                    prompt: >-
                      Generate a video of the character walking along a city
                      street, using the character appearance in the reference
                      images.
                    image_urls:
                      - https://example.com/character-reference.png
                    customize_multi_shots: true
                    multi_prompt:
                      - prompt: A wide shot of the character walking through the city.
                        duration: 2
                      - prompt: A close-up of the character looking toward the camera.
                        duration: 3
                    audio: true
                    resolution: 720p
                    aspect_ratio: '16:9'
                    duration: 5
                    elements: []
                - model: kling-3.0-omni/reference-to-video
                  callBackUrl: https://your-domain.com/api/callback
                  input:
                    prompt: Generate a natural, smooth video based on the input video.
                    video_urls:
                      - https://example.com/reference-video.mp4
                    audio: false
                    resolution: 720p
                    aspect_ratio: auto
                - model: kling-3.0-omni/reference-to-video
                  callBackUrl: https://your-domain.com/api/callback
                  input:
                    prompt: >-
                      Generate a video of the character walking along a city
                      street, using the character shown in the reference video
                      and images.
                    image_urls:
                      - https://example.com/reference-image.jpg
                    video_urls:
                      - https://example.com/reference-video.mp4
                    audio: false
                    resolution: 1080p
                    aspect_ratio: '16:9'
                    duration: 5
                          examples: {}

=====

# Video Models > Kling > Kling 3.0 Omni  Image To Video
Fuente: https://docs.kie.ai/market/kling/v3-omni-image-to-video.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Kling 3.0 Omni  Image To Video
      description: >-
        ## Query Task Status

        After submitting a task, you can check the task progress and retrieve
        generation results via the unified query endpoint:

        

        ::: tip[]

        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: kling-3.0-omni-image-to-video
      tags:
        - docs/en/Market/Video Models/Kling
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
              properties:
                model:
                  type: string
                  enum:
                    - kling-3.0-omni/image-to-video
                  default: kling-3.0-omni/image-to-video
                  description: >-
                    The name of the model used to generate the task. This field
                    is required.

                    - This endpoint requires the `kling-3.0-omni/image-to-video`
                    model
                  examples:
                    - kling-3.0-omni/image-to-video
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.

                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  description: >-
                    Input parameters for the generation task. Rules: (1)
                    customize_multi_shots and prefer_multi_shots cannot both be
                    true; (2) customize_multi_shots = true requires 1–6
                    multi_prompt shots (each 1–12 s, total ≤ 15 s); (3)
                    otherwise omit multi_prompt; (4) for image-to-video
                    single-shot, aspect_ratio must be "auto".
                  oneOf:
                    - title: Single First Frame
                      type: object
                      required:
                        - prompt
                        - image_urls
                      properties:
                        prompt:
                          type: string
                          maxLength: 3072
                          pattern: ^.*\S.*$
                          description: >-
                            Video description. It must not be empty after
                            leading and trailing whitespace is removed. Maximum
                            length: 3,072 characters.
                          examples:
                            - >-
                              A happy golden retriever running across a grassy
                              field
                        image_urls:
                          type: array
                          description: >-
                            Array of first-frame image URLs. Exactly 1 image is
                            required. HTTP, HTTPS, and OSS URLs are supported.
                            Images must be in JPG, JPEG, or PNG format; each
                            file must not exceed 50 MB; both width and height
                            must be at least 300 px; and the aspect ratio must
                            be between 0.4 and 2.5.
                          minItems: 1
                          maxItems: 1
                          items:
                            type: string
                            format: uri
                            pattern: ^(https?|oss)://
                            examples:
                              - https://example.com/first-frame.jpg
                          examples:
                            - - https://example.com/first-frame.jpg
                        duration:
                          type: integer
                          description: >-
                            Total video duration in seconds. Optional; the
                            default is 5 seconds. Supports integer values from 3
                            to 15.
                          enum:
                            - 3
                            - 4
                            - 5
                            - 6
                            - 7
                            - 8
                            - 9
                            - 10
                            - 11
                            - 12
                            - 13
                            - 14
                            - 15
                          default: 5
                          minimum: 3
                          maximum: 15
                          examples:
                            - 5
                        resolution:
                          type: string
                          description: >-
                            Video resolution. `720p` outputs a 720p video,
                            `1080p` outputs a 1080p video, and `4k` outputs a 4K
                            video.
                          enum:
                            - 720p
                            - 1080p
                            - 4k
                          default: 720p
                                                        name: ''
                              description: ''
                            - value: 1080p
                              name: ''
                              description: ''
                            - value: 4k
                              name: ''
                              description: ''
                          examples:
                            - 720p
                        aspect_ratio:
                          type: string
                          description: >-
                            Video aspect ratio. `16:9`, `9:16`, and `1:1` can be
                            selected only when custom multi-shot mode is enabled
                            through `customize_multi_shots`; otherwise, use
                            `auto`.
                          enum:
                            - '16:9'
                            - '9:16'
                            - '1:1'
                            - auto
                          default: auto
                                                        name: ''
                              description: ''
                            - value: '9:16'
                              name: ''
                              description: ''
                            - value: '1:1'
                              name: ''
                              description: ''
                            - value: auto
                              name: ''
                              description: ''
                          examples:
                            - auto
                        audio:
                          type: boolean
                          description: >-
                            Whether to enable audio. Passing this value
                            explicitly is recommended. `true` enables audio;
                            `false` disables audio.
                          examples:
                            - false
                        customize_multi_shots:
                          type: boolean
                          description: >-
                            Optional, default false. Set true for custom
                            multi-shot (multi_prompt required).
                          examples:
                            - true
                          default: false
                        prefer_multi_shots:
                          type: boolean
                          description: >-
                            Whether to enable intelligent shot planning. This
                            field is mutually exclusive with
                            `customize_multi_shots`.
                          examples:
                            - true
                        multi_prompt:
                          type: array
                          description: >-
                            List of custom shots. When
                            `customize_multi_shots=true`, this field is required
                            and may contain up to 6 shots. When
                            `customize_multi_shots=false`, it must be an empty
                            array or omitted.
                          minItems: 1
                          maxItems: 6
                          items:
                            type: object
                            required:
                              - duration
                              - prompt
                            properties:
                              duration:
                                type: integer
                                description: >-
                                  Duration of this shot in seconds, 1–12. The
                                  sum of all shots must not exceed 15.
                                minimum: 1
                                maximum: 12
                                examples:
                                  - 2
                              prompt:
                                type: string
                                description: >-
                                  Video description for the current shot.
                                  Maximum length: 512 characters.
                                minLength: 1
                                maxLength: 512
                                examples:
                                  - >-
                                    A wide shot of the fox entering the snowy
                                    forest.
                                                                                  examples:
                            - - duration: 2
                                prompt: >-
                                  A wide shot of the fox entering the snowy
                                  forest.
                              - duration: 3
                                prompt: >-
                                  A wide shot of the fox entering the snowy
                                  forest.
                        elements:
                          type: array
                          description: >-
                            List of one-time subject assets. The default is an
                            empty array, with up to 3 subjects. The subject is
                            automatically identified as a multi-image subject or
                            video character subject based on
                            `element_input_urls`.
                          maxItems: 3
                          default: []
                          items:
                            type: object
                            required:
                              - name
                              - description
                              - element_input_urls
                            properties:
                              name:
                                type: string
                                description: >-
                                  Subject name. It must be unique within the
                                  same request and can be referenced in the
                                  prompt using `@name`.
                                examples:
                                  - element_dog
                              description:
                                type: string
                                description: Subject description.
                                examples:
                                  - A happy golden retriever
                              element_input_urls:
                                type: array
                                description: >-
                                  For a multi-image subject, provide 2 to 4
                                  images. For a video character subject, provide
                                  exactly 1 video. Images and videos cannot be
                                  mixed. HTTP, HTTPS, and OSS URLs are
                                  supported.
                                minItems: 1
                                maxItems: 4
                                items:
                                  type: string
                                  format: uri
                                  pattern: ^(https?|oss)://
                                examples:
                                  - - https://example.com/dog-front.png
                                    - https://example.com/dog-side.png
                              element_input_audio_urls:
                                type: array
                                description: >-
                                  Optional list of subject reference audio URLs.
                                  It may be omitted or passed as an empty array.
                                  If the audio duration can be determined, it
                                  must be between 5 and 30 seconds.
                                default: []
                                items:
                                  type: string
                                  format: uri
                                  pattern: ^(https?|oss)://
                                examples:
                                  - []
                              start_time:
                                type: integer
                                description: >-
                                  Start time for trimming the video character
                                  subject, in milliseconds. The default is 0.
                                  This applies only when a video is provided in
                                  `element_input_urls`.
                                default: 0
                                minimum: 0
                                examples:
                                  - 0
                              end_time:
                                type: integer
                                description: >-
                                  End time for trimming the video character
                                  subject, in milliseconds. The default is
                                  8,000. It must be greater than `start_time`,
                                  and the trimmed duration must be between 3,000
                                  and 8,000 milliseconds.
                                default: 8000
                                minimum: 3000
                                examples:
                                  - 8000
                                                                              allOf:
                        - type: string
                        - type: string
                        - type: string
                      additionalProperties: false
                                                                  type: object
                      required:
                        - prompt
                        - image_urls
                      properties:
                        prompt:
                          type: string
                          maxLength: 3072
                          pattern: ^.*\S.*$
                          description: >-
                            Video description. It must not be empty after
                            leading and trailing whitespace is removed. Maximum
                            length: 3,072 characters.
                          examples:
                            - >-
                              A happy golden retriever running across a grassy
                              field
                        image_urls:
                          type: array
                          description: >-
                            Array of first-frame and last-frame image URLs.
                            Exactly 2 images are required: index 0 is the first
                            frame and index 1 is the last frame. HTTP, HTTPS,
                            and OSS URLs are supported. Images must be in JPG,
                            JPEG, or PNG format; each file must not exceed 50
                            MB; both width and height must be at least 300 px;
                            and the aspect ratio must be between 0.4 and 2.5.
                          minItems: 2
                          maxItems: 2
                          items:
                            type: string
                            format: uri
                            pattern: ^(https?|oss)://
                          examples:
                            - - https://example.com/first-frame.jpg
                              - https://example.com/last-frame.jpg
                        duration:
                          type: integer
                          description: >-
                            Total video duration in seconds. Optional; the
                            default is 5 seconds. Supports integer values from 3
                            to 15.
                          enum:
                            - 3
                            - 4
                            - 5
                            - 6
                            - 7
                            - 8
                            - 9
                            - 10
                            - 11
                            - 12
                            - 13
                            - 14
                            - 15
                          default: 5
                          minimum: 3
                          maximum: 15
                          examples:
                            - 5
                        resolution:
                          type: string
                          description: >-
                            Video resolution. `720p` outputs a 720p video,
                            `1080p` outputs a 1080p video, and `4k` outputs a 4K
                            video.
                          enum:
                            - 720p
                            - 1080p
                            - 4k
                          default: 720p
                                                        name: ''
                              description: ''
                            - value: 1080p
                              name: ''
                              description: ''
                            - value: 4k
                              name: ''
                              description: ''
                          examples:
                            - 720p
                        aspect_ratio:
                          type: string
                          description: >-
                            Video aspect ratio. `16:9`, `9:16`, and `1:1` can be
                            selected only when custom multi-shot mode is enabled
                            through `customize_multi_shots`; otherwise, use
                            `auto`.
                          enum:
                            - '16:9'
                            - '9:16'
                            - '1:1'
                            - auto
                          default: auto
                                                        name: ''
                              description: ''
                            - value: '9:16'
                              name: ''
                              description: ''
                            - value: '1:1'
                              name: ''
                              description: ''
                            - value: auto
                              name: ''
                              description: ''
                          examples:
                            - auto
                        audio:
                          type: boolean
                          description: >-
                            Whether to enable audio. `true` enables audio;
                            `false` disables audio.
                          examples:
                            - false
                        customize_multi_shots:
                          type: boolean
                          description: >-
                            Optional, default false. Set true for custom
                            multi-shot (multi_prompt required).
                          default: false
                          examples:
                            - false
                        prefer_multi_shots:
                          type: boolean
                          description: >-
                            Whether to enable intelligent shot planning. This
                            field is mutually exclusive with
                            `customize_multi_shots`.
                          examples:
                            - true
                        multi_prompt:
                          type: array
                          description: >-
                            List of custom shots. When
                            `customize_multi_shots=true`, this field is required
                            and may contain up to 6 shots. When
                            `customize_multi_shots=false`, it must be an empty
                            array or omitted.
                          minItems: 1
                          maxItems: 6
                          items:
                            type: object
                            required:
                              - duration
                              - prompt
                            properties:
                              duration:
                                type: integer
                                description: >-
                                  Duration of this shot in seconds, 1–12. The
                                  sum of all shots must not exceed 15.
                                minimum: 1
                                maximum: 12
                                examples:
                                  - 2
                              prompt:
                                type: string
                                description: >-
                                  Video description for the current shot.
                                  Maximum length: 512 characters.
                                minLength: 1
                                maxLength: 512
                                examples:
                                  - >-
                                    A wide shot of the fox entering the snowy
                                    forest.
                                                                                  examples:
                            - - duration: 2
                                prompt: >-
                                  A wide shot of the fox entering the snowy
                                  forest.
                              - duration: 3
                                prompt: >-
                                  A wide shot of the fox entering the snowy
                                  forest.
                        elements:
                          type: array
                          description: >-
                            List of one-time subject assets. The default is an
                            empty array, with up to 3 subjects.
                          maxItems: 3
                          default: []
                          items:
                            type: object
                            required:
                              - name
                              - description
                              - element_input_urls
                            properties:
                              name:
                                type: string
                                description: Subject name.
                                examples:
                                  - element_dog
                              description:
                                type: string
                                description: Subject description.
                                examples:
                                  - A happy golden retriever
                              element_input_urls:
                                type: array
                                description: >-
                                  For a multi-image subject, provide 2 to 4
                                  images. For a video character subject, provide
                                  exactly 1 video. Images and videos cannot be
                                  mixed. HTTP, HTTPS, and OSS URLs are
                                  supported.
                                minItems: 1
                                maxItems: 4
                                items:
                                  type: string
                                  format: uri
                                  pattern: ^(https?|oss)://
                                examples:
                                  - - https://example.com/dog-front.png
                                    - https://example.com/dog-side.png
                              element_input_audio_urls:
                                type: array
                                description: Optional list of subject reference audio URLs.
                                default: []
                                items:
                                  type: string
                                  format: uri
                                  pattern: ^(https?|oss)://
                                examples:
                                  - []
                              start_time:
                                type: integer
                                description: >-
                                  Start time for trimming the video character
                                  subject, in milliseconds. The default is 0.
                                default: 0
                              end_time:
                                type: integer
                                description: >-
                                  End time for trimming the video character
                                  subject, in milliseconds. The default is
                                  8,000.
                                default: 8000
                                                                              allOf:
                        - type: string
                        - type: string
                        - type: string
                      additionalProperties: false
                                                                        examples:
                - model: kling-3.0-omni/image-to-video
                  callBackUrl: https://your-domain.com/api/callback
                  input:
                    prompt: A happy golden retriever running across a grassy field
                    image_urls:
                      - https://example.com/first-frame.jpg
                    customize_multi_shots: false
                    audio: false
                    resolution: 720p
                    aspect_ratio: auto
                    duration: 5
                    elements: []
                - model: kling-3.0-omni/image-to-video
                  callBackUrl: https://your-domain.com/api/callback
                  input:
                    prompt: A happy golden retriever running across a grassy field
                    image_urls:
                      - https://example.com/first-frame.jpg
                      - https://example.com/last-frame.jpg
                    customize_multi_shots: false
                    audio: false
                    resolution: 720p
                    aspect_ratio: auto
                    duration: 5
                    elements: []
                          examples: {}

=====

# Video Models > Kling > Kling 3.0 Omni Text to Video
Fuente: https://docs.kie.ai/market/kling/v3-omni-text-to-video.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Kling 3.0 Omni Text to Video
      description: >-
        ## Query Task Status

        After submitting a task, you can check the task progress and retrieve
        generation results via the unified query endpoint:

        

        ::: tip[]

        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: kling-3.0-omni-text-to-video
      tags:
        - docs/en/Market/Video Models/Kling
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  enum:
                    - kling-3.0-omni/text-to-video
                  default: kling-3.0-omni/text-to-video
                  description: >-
                    The name of the model used to generate the task. This field
                    is required.

                    - This endpoint requires the `kling-3.0-omni/text-to-video`
                    model
                  examples:
                    - kling-3.0-omni/text-to-video
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.

                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: >-
                    Input parameter configuration for the generation task.
                    Rules: (1) customize_multi_shots and prefer_multi_shots
                    cannot both be true; (2) customize_multi_shots = true
                    requires 1–6 multi_prompt shots (each 1–12 s, total ≤ 15 s);
                    (3) otherwise omit multi_prompt.
                  required:
                    - prompt
                  properties:
                    prompt:
                      type: string
                      description: >-
                        Text description of the video. It must not be empty
                        after leading and trailing whitespace is removed, and
                        must not exceed 3,072 characters.
                      minLength: 1
                      maxLength: 3072
                    customize_multi_shots:
                      type: boolean
                      description: >-
                        Optional, default false. Set true for custom multi-shot
                        (multi_prompt required).
                      default: false
                      examples:
                        - true
                    prefer_multi_shots:
                      type: boolean
                      description: >-
                        Whether to enable intelligent shot planning. This field
                        is mutually exclusive with `customize_multi_shots`.

                        Both fields may be `false`, but they cannot both be
                        `true`.
                      examples:
                        - true
                    multi_prompt:
                      type: array
                      description: >-
                        List of custom shots. When `customize_multi_shots` is
                        `true`, this field is required, must not be empty, and
                        supports up to 6 shots. When `customize_multi_shots` is
                        `false`, it must be an empty array or omitted.
                      maxItems: 6
                      default: []
                      items:
                        type: object
                        required:
                          - prompt
                          - duration
                        properties:
                          prompt:
                            type: string
                            description: >-
                              Video description for the current shot. Maximum
                              length: 512 characters.
                            minLength: 1
                            maxLength: 512
                            examples:
                              - >-
                                A wide shot of the fox entering the snowy
                                forest.
                          duration:
                            type: integer
                            description: >-
                              Duration of this shot in seconds, 1–12. The sum of
                              all shots must not exceed 15.
                            minimum: 1
                            maximum: 12
                            examples:
                              - 2
                                                                      examples:
                        - - prompt: A wide shot of the fox entering the snowy forest.
                            duration: 2
                          - prompt: >-
                              A cinematic close-up of the fox looking toward the
                              sunrise.
                            duration: 3
                    elements:
                      type: array
                      items:
                        type: object
                        required:
                          - name
                          - description
                          - element_input_urls
                        properties:
                          name:
                            type: string
                            description: >-
                              Subject name. It must be unique within the same
                              request and can be referenced in the `prompt`
                              field using `@name`.
                            minLength: 1
                            examples:
                              - element_dog
                          description:
                            type: string
                            description: Text description of the subject asset.
                            minLength: 1
                            examples:
                              - A happy golden retriever
                          element_input_urls:
                            type: array
                            description: >-
                              List of image URLs for a multi-image subject
                              (provide 2 to 4 images), or a video URL for a
                              video character subject (provide exactly 1 video).
                              Images and videos cannot be mixed. HTTP, HTTPS,
                              and OSS URLs are supported.
                            minItems: 1
                            maxItems: 4
                            items:
                              type: string
                              format: uri
                              pattern: ^(https?|oss)://
                            examples:
                              - - https://example.com/dog-front.png
                                - https://example.com/dog-side.png
                          element_input_audio_urls:
                            type: array
                            description: >-
                              Optional list of subject audio asset URLs. HTTP,
                              HTTPS, and OSS URLs are supported.
                            default: []
                            items:
                              type: string
                              format: uri
                              pattern: ^(https?|oss)://
                            examples:
                              - []
                                                                      description: >-
                        List of one-time subject assets. The default is an empty
                        array.

                        When using only multi-image subjects, up to 7 subjects
                        can be uploaded.

                        When using only video character subjects, the number of
                        video character subjects must not exceed 3.

                        When using both video character and multi-image
                        subjects, the number of video character subjects must
                        not exceed 3, and the number of multi-image subjects
                        must not exceed 4.
                      default: []
                    audio:
                      type: boolean
                      description: >-
                        Whether to add audio to the generated video. `true`
                        enables audio; `false` disables audio.
                      default: false
                      examples:
                        - false
                    resolution:
                      type: string
                      description: >-
                        Resolution of the generated video. Available values are
                        `720p` (outputs a 720p video), `1080p` (outputs a 1080p
                        video), and `4k` (outputs a 4K video).
                      enum:
                        - 720p
                        - 1080p
                        - 4k
                      default: 720p
                                                name: ''
                          description: ''
                        - value: 1080p
                          name: ''
                          description: ''
                        - value: 4k
                          name: ''
                          description: ''
                      examples:
                        - 720p
                    aspect_ratio:
                      type: string
                      description: >-
                        Aspect ratio of the generated video. Supported values
                        are `16:9`, `9:16`, and `1:1`.
                      enum:
                        - '16:9'
                        - '9:16'
                        - '1:1'
                      default: '16:9'
                      examples:
                        - '16:9'
                    duration:
                      type: integer
                      description: >-
                        Total video duration in seconds. The supported range is
                        3 to 15 seconds, and the default is 5 seconds.
                      enum:
                        - 3
                        - 4
                        - 5
                        - 6
                        - 7
                        - 8
                        - 9
                        - 10
                        - 11
                        - 12
                        - 13
                        - 14
                        - 15
                      default: 5
                      minimum: 3
                      maximum: 15
                      examples:
                        - 5
                  allOf:
                    - type: string
                    - type: string
                    - type: string
                    - type: string
                                                                examples:
                - model: kling-3.0-omni/text-to-video
                  callBackUrl: https://your-domain.com/api/callback
                  input:
                    prompt: A wide shot of the fox entering the snowy forest.
                    customize_multi_shots: true
                    multi_prompt:
                      - prompt: A wide shot of the fox entering the snowy forest.
                        duration: 2
                      - prompt: >-
                          A cinematic close-up of the fox looking toward the
                          sunrise.
                        duration: 3
                    audio: false
                    resolution: 720p
                    aspect_ratio: '16:9'
                    duration: 5
                          examples: {}

=====

# Video Models > Bytedance > bytedance-seedance-2
Fuente: https://docs.kie.ai/market/bytedance/seedance-2.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Bytedance Seedance 2.0
      description: >
        ## Query Task Status

        After submitting a task, use the unified query endpoint to check
        progress and retrieve results:

        

        ::: tip[]

        In production environments, it is recommended to use the callBackUrl
        parameter to receive automatic notifications upon completion, rather
        than polling the status API.

        :::

        > **Note**

        >

        > *   **Image-to-Video (First Frame)**, **Image-to-Video (First & Last
        Frames)**, and **Multimodal Reference-to-Video** (including reference
        images, videos, and audio) are three mutually exclusive scenarios and
        **cannot be used simultaneously**.

        > *   Do not combine `first_frame_url` / `last_frame_url` with any
        `reference_*` field.

        > *   Multimodal Reference-to-Video can indirectly achieve a "First/Last
        Frame + Multimodal Reference" effect by specifying reference images as
        the first or last frame via prompts. If you need to strictly guarantee
        that the first and last frames are identical to the specified images,
        **prioritize using Image-to-Video (First & Last Frames)**

        ## Key Features

        
          
          
          
        </CardGroup>

        :::tip

        With reference video(s), billing uses a lower per-second price × (total
        reference-video duration + output duration). With duration = -1, billing
        follows the duration actually generated. For current prices, see
        [kie.ai/pricing](https://kie.ai/pricing).

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: bytedance-seedance-2
      tags:
        - docs/en/Market/Video Models/Bytedance
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  description: |-
                    The model name to use for generation. Required field.

                    - Must be `bytedance/seedance-2` for this endpoint
                  enum:
                    - bytedance/seedance-2
                  default: bytedance/seedance-2
                                        name: ''
                      description: ''
                  examples:
                    - bytedance/seedance-2
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.

                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the generation task
                  properties:
                    prompt:
                      type: string
                      description: >-
                        The text prompt used to generate the video. Required
                        field. (Min length: 3, Max length: 20000 characters)
                      minLength: 3
                      maxLength: 20000
                      examples:
                        - >-
                          A serene beach at sunset with waves gently crashing on
                          the shore, palm trees swaying in the breeze, and
                          seagulls flying across the orange sky
                    first_frame_url:
                      type: string
                      description: |-
                        First frame image url or asset://{assetId} 
                        (for example: asset://asset-20260404242101-76djj)
                    last_frame_url:
                      type: string
                      description: |-
                        End frame image url or asset://{assetId} 
                        (for example: asset://asset-20260404242101-76djj)
                    reference_image_urls:
                      type: array
                      items:
                        type: string
                        format: uri
                      description: >-
                        Enter a list of image URLs or asset://{assetId} (for
                        example: asset://asset-20260404242101-76djj).

                        Single image requirements:

                        Format: jpeg, png, webp, bmp, tiff, gif.

                        Aspect ratio (width/height): (0.4, 2.5)

                        Width and height (px): (300, 6000)

                        Size: Single image less than 30 MB.

                        Up to 9 images.
                      maxItems: 9
                      examples:
                        - - https://example.com/your-image.png
                    reference_video_urls:
                      type: array
                      items:
                        type: string
                        format: uri
                      description: >-
                        Enter a list of video URLs or asset://{assetId} (for
                        example: asset://asset-20260404242101-76djj) .

                        Single video requirements:

                        Video format: mp4, mov.

                        Resolution: 480p, 720p

                        Duration: Single video duration [2, 15] s, maximum 3
                        reference videos, total duration of all videos not
                        exceeding 15 seconds.

                        Dimensions:

                        Aspect ratio (width/height): [0.4, 2.5]

                        Width/height (px): [300, 6000]

                        Total pixels: [640×640=409600, 834×1112=927408], i.e.,
                        the product of width and height must meet the range
                        requirement of [409600, 927408].

                        Size: Single video not exceeding 50 MB.

                        Frame rate (FPS): [24, 60]
                      maxItems: 3
                    reference_audio_urls:
                      type: array
                      items:
                        type: string
                        format: uri
                      description: >-
                        Enter a list of audio URLs or asset://{assetId} (for
                        example: asset://asset-20260404242101-76djj) .

                        Single audio requirements:

                        Format: wav, mp3

                        Duration: Single audio duration [2, 15] s, maximum 3
                        reference audios, total duration of all audios not
                        exceeding 15 s.

                        Size: Single audio file size not exceeding 15 MB.
                      maxItems: 3
                    return_last_frame:
                      type: boolean
                      description: >-
                        Whether to return the last frame of the video as an
                        image.
                      default: false
                      deprecated: true
                    generate_audio:
                      description: |-
                        Whether to generate audio for the video.

                        - **true**: Generate with audio
                        - **false**: Generate without audio
                      type: boolean
                      default: true
                      examples:
                        - false
                    resolution:
                      type: string
                      description: >-
                        Video resolution - 480p for faster generation, 720p for
                        balance, 1080p for High-quality video, 4K Ultra-High
                        Definition, delivering perfect visual details. 4k output
                        is 3840×2160 encoded as H.265 (HEVC); other resolutions
                        are H.264. Make sure your player or pipeline supports
                        HEVC.
                      enum:
                        - 480p
                        - 720p
                        - 1080p
                        - 4k
                      default: 720p
                      examples:
                        - 720p
                                                name: ''
                          description: ''
                        - value: 720p
                          name: ''
                          description: ''
                        - value: 1080p
                          name: ''
                          description: ''
                        - value: 4k
                          name: ''
                          description: ''
                    aspect_ratio:
                      type: string
                      description: Video aspect ratio configuration. Required field.
                      enum:
                        - '1:1'
                        - '4:3'
                        - '3:4'
                        - '16:9'
                        - '9:16'
                        - '21:9'
                        - adaptive
                      default: '16:9'
                                                name: ''
                          description: ''
                        - value: '4:3'
                          name: ''
                          description: ''
                        - value: '3:4'
                          name: ''
                          description: ''
                        - value: '16:9'
                          name: ''
                          description: ''
                        - value: '9:16'
                          name: ''
                          description: ''
                        - value: '21:9'
                          name: ''
                          description: ''
                        - value: adaptive
                          name: ''
                          description: ''
                      examples:
                        - '16:9'
                    duration:
                      type: integer
                      description: Video duration in 4-15 seconds or -1.
                      default: 5
                      examples:
                        - 5
                    web_search:
                      type: boolean
                      description: Use online search. Text-to-video only.
                    nsfw_checker:
                      type: boolean
                      description: >-
                        Defaults to false. When false, no additional content
                        filtering is applied and results are returned directly
                        by the model.
                                                        01KWKMN7PBRAKVAWC9BZ3PW3YJ:
                      $ref: '#/components/schemas/nsfw_checker'
                                                          example:
              model: bytedance/seedance-2
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  A serene beach at sunset with waves gently crashing on the
                  shore, palm trees swaying in the breeze, and seagulls flying
                  across the orange sky
                reference_image_urls:
                  - https://example.com/your-image.png
                reference_video_urls:
                  - https://example.com/your-video.mp4
                reference_audio_urls:
                  - https://example.com/your-audio.mp3
                return_last_frame: false
                generate_audio: false
                resolution: 480p
                aspect_ratio: '16:9'
                duration: 5
                web_search: false

=====

# Video Models > Bytedance > Bytedance Seedance 2.5
Fuente: https://docs.kie.ai/market/bytedance/seedance-2-5.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Bytedance Seedance 2.5
      description: >
        ## Query Task Status

        After submitting a task, use the unified query endpoint to check
        progress and retrieve results:

        

        ::: tip[]

        In production environments, it is recommended to use the callBackUrl
        parameter to receive automatic notifications upon completion, rather
        than polling the status API.

        :::

        > **Note**

        >

        > *   **Image-to-Video (First Frame)**, **Image-to-Video (First & Last
        Frames)**, and **Multimodal Reference-to-Video** (including reference
        images, videos, and audio) are three mutually exclusive scenarios and
        **cannot be used simultaneously**.

        > *   Multimodal Reference-to-Video can indirectly achieve a "First/Last
        Frame + Multimodal Reference" effect by specifying reference images as
        the first or last frame via prompts. If you need to strictly guarantee
        that the first and last frames are identical to the specified images,
        **prioritize using Image-to-Video (First & Last Frames)**

        ## Key Features

        
          
          
          
        </CardGroup>

        :::tip

        With reference video(s), billing uses a lower per-second price × (total
        reference-video duration + output duration); reference images and
        reference audio do not add billable seconds. With duration = -1, billing
        follows the duration actually generated. For current prices, see
        [kie.ai/pricing](https://kie.ai/pricing).

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: bytedance-seedance-2-5
      tags:
        - docs/en/Market/Video Models/Bytedance
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  description: |-
                    The model name to use for generation. Required field.

                    - Must be `bytedance/seedance-2-5` for this endpoint
                  enum:
                    - bytedance/seedance-2-5
                  default: bytedance/seedance-2-5
                                        name: ''
                      description: ''
                  examples:
                    - bytedance/seedance-2-5
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.

                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the generation task
                  properties:
                    prompt:
                      type: string
                      description: >-
                        The text prompt used to generate the video.. ( Max
                        length: 20480 characters)
                      maxLength: 20480
                      examples:
                        - >-
                          A serene beach at sunset with waves gently crashing on
                          the shore, palm trees swaying in the breeze, and
                          seagulls flying across the orange sky
                    first_frame_url:
                      type: string
                      description: >-
                        First frame image url or asset://{assetId} 

                        (for example: asset://asset-20260404242101-76djj)

                        Cannot be used simultaneously with reference_image_urls,
                        reference_video_urls, or reference_audio_urls.
                    last_frame_url:
                      type: string
                      description: >-
                        End frame image url or asset://{assetId} 

                        (for example: asset://asset-20260404242101-76djj)

                        last_frame_url cannot be passed alone; first_frame_url
                        must be provided together with it.
                    reference_image_urls:
                      type: array
                      items:
                        type: string
                        format: uri
                      description: >-
                        Enter a list of image URLs or asset://{assetId} (for
                        example: asset://asset-20260404242101-76djj).

                        Single image requirements:

                        Format: jpeg, png, webp.

                        Aspect ratio (width/height): (0.4, 2.5)

                        Width and height (px): (300, 6000)

                        Size: Single image less than 30 MB.

                        Up to 30 images.

                        Mutually exclusive with the first/last-frame scenario;
                      maxItems: 30
                      examples:
                        - - https://example.com/your-image.png
                    reference_video_urls:
                      type: array
                      items:
                        type: string
                        format: uri
                      description: >-
                        Enter a list of video URLs or asset://{assetId} (for
                        example: asset://asset-20260404242101-76djj) .

                        Single video requirements:

                        Video format: mp4, mov, mkv.

                        Resolution: 480p, 720p

                        Dimensions:

                        Aspect ratio (width/height): [0.4, 2.5]

                        Width/height (px): [300, 6000]

                        Total pixels: [640×640=409600, 834×1112=927408], i.e.,
                        the product of width and height must meet the range
                        requirement of [409600, 927408].

                        Size: Single video not exceeding 200 MB.

                        Frame rate (FPS): [24, 60]

                        Single video duration: [2, 30] seconds; 

                        Mutually exclusive with the first/last-frame scenario;
                        Total duration of reference videos must not exceed 30
                        seconds.
                      maxItems: 10
                    reference_audio_urls:
                      type: array
                      items:
                        type: string
                        format: uri
                      description: >-
                        Enter a list of audio URLs or asset://{assetId} (for
                        example: asset://asset-20260404242101-76djj) .

                        Single audio requirements:

                        Format: wav, mp3, aac, ogg

                        Size: Single audio file size not exceeding 15 MB.

                        Single audio duration: [2, 30] seconds; mutually
                        exclusive with first/last frames; total duration of
                        reference audio must not exceed 30 seconds.
                      maxItems: 10
                    return_last_frame:
                      type: boolean
                      description: >-
                        Whether to also return the last frame of the generated
                        video as a JPEG (in resultJson.lastFrameUrl). Default
                        false.
                      default: false
                    generate_audio:
                      description: >-
                        Whether to generate audio synchronized with the video.
                        Default: true.
                      type: boolean
                      default: true
                      examples:
                        - false
                    resolution:
                      type: string
                      description: >-
                        Video resolution - 480p for faster generation, 720p for
                        balance.
                      enum:
                        - 480p
                        - 720p
                        - 1080p
                      default: 720p
                      examples:
                        - 720p
                                                name: ''
                          description: ''
                        - value: 720p
                          name: ''
                          description: ''
                        - value: 1080p
                          name: ''
                          description: ''
                    aspect_ratio:
                      type: string
                      description: 'Video aspect ratio configuration. '
                      enum:
                        - '1:1'
                        - '4:3'
                        - '3:4'
                        - '16:9'
                        - '9:16'
                        - '21:9'
                        - adaptive
                      default: adaptive
                                                name: ''
                          description: ''
                        - value: '4:3'
                          name: ''
                          description: ''
                        - value: '3:4'
                          name: ''
                          description: ''
                        - value: '16:9'
                          name: ''
                          description: ''
                        - value: '9:16'
                          name: ''
                          description: ''
                        - value: '21:9'
                          name: ''
                          description: ''
                        - value: adaptive
                          name: ''
                          description: ''
                      examples:
                        - adaptive
                    duration:
                      type: integer
                      description: |-
                        Video duration in 4-30 seconds.
                        Special values -1:
                         Pass -1 for automatic duration selection — the model picks a suitable duration itself (for video-editing tasks, it matches the input video's length; for other task types, it selects within the valid range), instead of you specifying an exact value.
                      default: 5
                      examples:
                        - 5
                    output_format:
                      type: string
                      description: Video output format.
                      enum:
                        - mp4
                        - mov
                                                name: ''
                          description: ''
                        - value: mov
                          name: ''
                          description: ''
                      default: mp4
                      examples:
                        - mp4
                    web_search:
                      type: boolean
                      description: Enable online search.
                    draft:
                      type: boolean
                      description: >-
                        Enable draft mode. When enabled, only 480p resolution is
                        allowed. Draft task ID is valid for 7 days from draft
                        creation.
                      default: false
                      examples:
                        - false
                    nsfw_checker:
                      type: boolean
                      description: >-
                        Defaults to false. When false, no additional content
                        filtering is applied and results are returned directly
                        by the model.
                                                        01KWKMN7PBRAKVAWC9BZ3PW3YJ:
                      $ref: '#/components/schemas/nsfw_checker'
                                                          example:
              model: bytedance/seedance-2-5
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  A tranquil beach at sunset, with gentle waves lapping the
                  shore, palm trees swaying in the breeze, and seagulls flying
                  across the orange sky.
                reference_image_urls:
                  - https://example.com/your-image.png
                reference_video_urls:
                  - https://example.com/your-video.mp4
                reference_audio_urls:
                  - https://example.com/your-audio.mp3
                return_last_frame: false
                generate_audio: false
                resolution: 720p
                aspect_ratio: '16:9'
                duration: 15

=====

# Video Models > Hailuo > Hailuo 2.3 Pro Image to Video
Fuente: https://docs.kie.ai/market/hailuo/2-3-image-to-video-pro.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Hailuo 2.3 Pro Image to Video
      description: >-
        Content generation using hailuo/2-3-image-to-video-pro

        ## Query Task Status

        After submitting a task, use the unified query endpoint to check
        progress and retrieve results:

        

        ::: tip[]

        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: hailuo-2-3-image-to-video-pro
      tags:
        - docs/en/Market/Video Models/Hailuo
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  enum:
                    - hailuo/2-3-image-to-video-pro
                  default: hailuo/2-3-image-to-video-pro
                  description: |-
                    The model name to use for generation. Required field.

                    - Must be `hailuo/2-3-image-to-video-pro` for this endpoint
                  examples:
                    - hailuo/2-3-image-to-video-pro
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.

                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the generation task
                  properties:
                    prompt:
                      description: >-
                        Text prompt describing the desired video animation (Max
                        length: 5000 characters)
                      type: string
                      maxLength: 5000
                      examples:
                        - >-
                          A graceful geisha performs a traditional Japanese
                          dance indoors. She wears a luxurious red kimono with
                          golden floral embroidery, white obi belt, and white
                          tabi socks. Soft and elegant hand movements,
                          expressive pose, sleeves flowing naturally. Scene set
                          in a Japanese tatami room with warm ambient lighting,
                          shoji paper sliding doors, and cherry blossom branches
                          hanging in the foreground. Cinematic, soft depth of
                          field, high detail fabric texture, hyper-realistic,
                          smooth motion.
                    image_url:
                      description: >-
                        Input image to animate (File URL after upload, not file
                        content; Accepted types: image/jpeg, image/png,
                        image/webp; Max size: 10.0MB)
                      type: string
                      examples:
                        - >-
                          https://file.aiquickdraw.com/custom-page/akr/section-images/1761736831884xl56xfiw.webp
                    duration:
                      description: >-
                        Required. The duration of the video in seconds. 10
                        seconds videos are not supported for 1080p resolution.
                      type: string
                      enum:
                        - '6'
                        - '10'
                      examples:
                        - '6'
                    resolution:
                      description: Required. The resolution of the generated video.
                      type: string
                      enum:
                        - 768P
                        - 1080P
                      examples:
                        - 768P
                    nsfw_checker:
                      type: boolean
                      description: >-
                        Defaults to false. When false, no additional content
                        filtering is applied and results are returned directly
                        by the model.
                  required:
                    - prompt
                    - image_url
                    - duration
                    - resolution
                                                        01KWKMV59J1YRS3ADCTBQRCDS9:
                      $ref: '#/components/schemas/nsfw_checker'
                                                          example:
              model: hailuo/2-3-image-to-video-pro
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  A graceful geisha performs a traditional Japanese dance
                  indoors. She wears a luxurious red kimono with golden floral
                  embroidery, white obi belt, and white tabi socks. Soft and
                  elegant hand movements, expressive pose, sleeves flowing
                  naturally. Scene set in a Japanese tatami room with warm
                  ambient lighting, shoji paper sliding doors, and cherry
                  blossom branches hanging in the foreground. Cinematic, soft
                  depth of field, high detail fabric texture, hyper-realistic,
                  smooth motion.
                image_url: >-
                  https://file.aiquickdraw.com/custom-page/akr/section-images/1761736831884xl56xfiw.webp
                duration: '6'
                resolution: 768P

=====

# Video Models > Wan > Wan 2.7 - Text to Video
Fuente: https://docs.kie.ai/market/wan/2-7-text-to-video.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Wan 2.7 - Text to Video
      description: >-
        ## Create Task

        Use this endpoint to create a new text-to-video generation task.

        

        ::: tip[]

        For production use, we recommend providing the `callBackUrl` parameter
        so your service can receive completion notifications instead of polling
        for task status.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: wan-2-7-text-to-video
      tags:
        - docs/en/Market/Video Models/Wan
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  enum:
                    - wan/2-7-text-to-video
                  default: wan/2-7-text-to-video
                  description: |-
                    The model name used for generation. This field is required.

                    - This endpoint must use the `wan/2-7-text-to-video` model
                  examples:
                    - wan/2-7-text-to-video
                input:
                  type: object
                  description: Input parameters for the text-to-video task.
                  required:
                    - prompt
                  properties:
                    prompt:
                      type: string
                      minLength: 1
                      maxLength: 5000
                      description: >-
                        Positive prompt. Minimum length: 1 character. Maximum
                        length: 5000 characters.
                    negative_prompt:
                      type: string
                      maxLength: 500
                      description: 'Negative prompt. Maximum length: 500 characters.'
                    audio_url:
                      type: string
                      format: uri
                      description: Optional custom audio URL.
                    resolution:
                      type: string
                      enum:
                        - 720p
                        - 1080p
                      default: 1080p
                      description: |-
                        Video resolution. 

                        - `720p`: 720p
                        - `1080p`: 1080p
                    ratio:
                      type: string
                      enum:
                        - '16:9'
                        - '9:16'
                        - '1:1'
                        - '4:3'
                        - '3:4'
                      default: '16:9'
                      description: |-
                        Video aspect ratio.

                        - `16:9`: Landscape
                        - `9:16`: Portrait
                        - `1:1`: Square
                        - `4:3`: Landscape 4:3
                        - `3:4`: Portrait 3:4
                    duration:
                      type: integer
                      minimum: 2
                      maximum: 15
                      default: 5
                      description: |-
                        Video duration in seconds.

                        - Minimum: `2`
                        - Maximum: `15`
                        - Default: `5`
                    prompt_extend:
                      type: boolean
                      default: true
                      description: >-
                        Whether to enable intelligent prompt rewriting. Default
                        value: `true`.
                    watermark:
                      type: boolean
                      default: false
                      description: >-
                        Whether to add an AI-generated watermark. Default value:
                        `false`.
                    seed:
                      type: integer
                      minimum: 0
                      maximum: 2147483647
                      description: |-
                        Random seed.

                        - Minimum: `0`
                        - Maximum: `2147483647`
                    nsfw_checker:
                      type: boolean
                      description: >-
                        Defaults to false. When false, no additional content
                        filtering is applied and results are returned directly
                        by the model.
                                                        01KWKP1MDAYX7NKBX2MXGPP9SS:
                      $ref: '#/components/schemas/nsfw_checker'
                                  callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    Callback URL for task completion notifications. Optional
                    parameter. If provided, the system will send a POST request
                    to this URL when the task completes, whether it succeeds or
                    fails. If omitted, no callback notification will be sent.
                                        example:
              model: wan/2-7-text-to-video
              input:
                prompt: >-
                  A futuristic city street at night, neon reflections shimmering
                  on the wet ground. The camera slowly pushes forward as a
                  silver hover car glides in from the left. Giant holographic
                  billboards flicker in the distance, creating a cinematic
                  atmosphere.
                negative_prompt: blurry, low quality, flicker, distorted characters
                audio_url: https://your-domain.com/audio/custom-track.mp3
                resolution: 1080p
                ratio: '16:9'
                duration: 5
                prompt_extend: true
                watermark: false
                seed: 123456
              callBackUrl: https://your-domain.com/api/callback

=====

# Video Models > Wan > Wan 2.7 - Image to Video
Fuente: https://docs.kie.ai/market/wan/2-7-image-to-video.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Wan 2.7 - Image to Video
      description: >-
        ## Create Task

        Use this endpoint to create a new image-to-video generation task.

        This model supports the following three generation modes:

        - First-frame-to-video: provide `first_frame_url` only

        - First-and-last-frame-to-video: provide both `first_frame_url` and
        `last_frame_url`

        - Video continuation: provide `first_clip_url`

        Provide at least one of first_frame_url or first_clip_url.

        

        ::: tip[]

        For production use, we recommend providing the `callBackUrl` parameter
        so your service can receive completion notifications instead of polling
        for task status.

        :::

        :::tip

        For video continuation, duration is the total length including the input
        clip, and the whole length is billed. For current prices, see
        [kie.ai/pricing](https://kie.ai/pricing).

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: wan-2-7-image-to-video
      tags:
        - docs/en/Market/Video Models/Wan
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  enum:
                    - wan/2-7-image-to-video
                  default: wan/2-7-image-to-video
                  description: >-
                    The model name used for generation. This field is required.
                    This endpoint must use the `wan/2-7-image-to-video` model.
                  examples:
                    - wan/2-7-image-to-video
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    Callback URL for task completion notifications. Optional
                    parameter. If provided, the system will send a POST request
                    to this URL when the task completes, whether it succeeds or
                    fails. If omitted, no callback notification will be sent.
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the image-to-video task.
                  properties:
                    prompt:
                      type: string
                      maxLength: 5000
                      description: 'Positive prompt. Maximum length: 5000 characters.'
                    negative_prompt:
                      type: string
                      maxLength: 500
                      description: 'Negative prompt. Maximum length: 500 characters.'
                    first_frame_url:
                      type: string
                      format: uri
                      description: First frame image URL.
                    last_frame_url:
                      type: string
                      format: uri
                      description: Last frame image URL.
                    first_clip_url:
                      type: string
                      format: uri
                      description: First clip video URL, used for video continuation.
                    driving_audio_url:
                      type: string
                      format: uri
                      description: Driving audio URL.
                    resolution:
                      type: string
                      enum:
                        - 720p
                        - 1080p
                      default: 1080p
                      description: |-
                        Video resolution. 

                        - `720p`: 720p
                        - `1080p`: 1080p
                    duration:
                      type: integer
                      minimum: 2
                      maximum: 15
                      default: 5
                      description: |-
                        Total output video duration in seconds.

                        - Minimum: `2`
                        - Maximum: `15`
                        - Default: `5`
                    prompt_extend:
                      type: boolean
                      default: true
                      description: >-
                        Whether to enable intelligent prompt rewriting. Default
                        value: `true`.
                    watermark:
                      type: boolean
                      default: false
                      description: >-
                        Whether to add an AI-generated watermark. Default value:
                        `false`.
                    seed:
                      type: integer
                      minimum: 0
                      maximum: 2147483647
                      description: |-
                        Random seed.

                        - Minimum: `0`
                        - Maximum: `2147483647`
                    nsfw_checker:
                      type: boolean
                      description: >-
                        Defaults to false. When false, no additional content
                        filtering is applied and results are returned directly
                        by the model.
                                    required:
                    - prompt
                                      01KWKP24VVHA3ESYYK5KE5XDR1:
                      $ref: '#/components/schemas/nsfw_checker'
                                                          examples:
              '1':
                value:
                  model: wan/2-7-image-to-video
                  callBackUrl: https://your-domain.com/api/callback
                  input:
                    prompt: >-
                      A white cat stands on a windowsill in warm afternoon
                      light. The camera slowly pushes in as the cat blinks
                      softly and turns to look outside.
                    negative_prompt: blurry, flicker, low quality, distorted
                    first_frame_url: https://your-domain.com/assets/first-frame.png
                    last_frame_url: https://your-domain.com/assets/last-frame.png
                    resolution: 1080p
                    duration: 5
                    prompt_extend: true
                    watermark: false
                    seed: 123456
                summary: First and last frame to video
              '2':
                value:
                  model: wan/2-7-image-to-video
                  callBackUrl: https://your-domain.com/api/callback
                  input:
                    prompt: >-
                      A white cat stands on a windowsill in warm afternoon
                      light. The camera slowly pushes in as the cat blinks
                      softly and turns to look outside.
                    negative_prompt: blurry, flicker, low quality, distorted
                    first_frame_url: https://your-domain.com/assets/first-frame.png
                    driving_audio_url: https://your-domain.com/assets/driving-audio.mp3
                    resolution: 1080p
                    duration: 5
                    prompt_extend: true
                    watermark: false
                    seed: 123456
                summary: First frame to video
              '3':
                value:
                  model: wan/2-7-image-to-video
                  callBackUrl: https://your-domain.com/api/callback
                  input:
                    prompt: >-
                      A white cat stands on a windowsill in warm afternoon
                      light. The camera slowly pushes in as the cat blinks
                      softly and turns to look outside.
                    negative_prompt: blurry, flicker, low quality, distorted
                    first_clip_url: https://your-domain.com/assets/first-clip.mp4
                    resolution: 1080p
                    duration: 5
                    prompt_extend: true
                    watermark: false
                    seed: 123456
                summary: Video continuation

=====

# Video Models > Gemini Omni > Gemini Omni 1.1 Flash
Fuente: https://docs.kie.ai/market/google/gemini-omni-flash-1-1.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Gemini Omni 1.1 Flash
      description: >
        ## Create Task

        Use this endpoint to create a new multimodal video generation task.

        

        ::: tip[]

        For production use, we recommend providing the `callBackUrl` parameter
        so your service can receive completion notifications instead of polling
        for task status.

        :::

        ## Related Resources

        
          
        </CardGroup>

        **Total Quota Overview:**

        The system utilizes a quota-based system for content uploads. The total
        available capacity is **7 units**. Different parameters consume
        different amounts of this quota. Please ensure the sum of all consumed
        units does not exceed 7.

        **Quota Consumption Rules:**

        1.  **Images (`image_urls`)**: Each image consumes **1 unit**.

        2.  **Videos (`video_list`)**: Each video consumes **2 units**.
            *   *Note: Maximum of 1 video per request.*
        3.  **Character IDs (`character_ids`)**: Each ID consumes **1 unit**.
            *   *Note: Maximum of 3 character IDs per request.*

        **Constraint Formula:**

        `(Number of Images) + (Number of Videos × 2) + (Number of Character IDs)
        ≤ 7`

        **Example Scenarios:**

        *   If 1 video (2 units) and 3 Character IDs (3 units) are uploaded, you
        can upload a maximum of 2 additional images.

        *   If no video or Character IDs are provided, you can upload up to 7
        images.

        **Note — first-frame mode:** when first_frame_url is set, image_urls,
        video_list, character_ids and audio_ids cannot be used.
      operationId: gemini-omni-1.1-flash
      tags:
        - docs/en/Market/Video Models/Gemini Omni
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  enum:
                    - google/gemini-omni-flash-1-1
                  default: google/gemini-omni-flash-1-1
                  description: >-
                    The model name used to generate the task. This field is
                    required. This interface must use the
                    `google/gemini-omni-flash-1-1` model.
                  examples:
                    - google/gemini-omni-flash-1-1
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The callback URL for task completion notifications. This
                    parameter is optional. If provided, the system will send a
                    POST request to this URL when the task is completed,
                    regardless of whether it succeeds or fails. If not provided,
                    no callback notification will be sent.
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the multimodal video generation task.
                  properties:
                    prompt:
                      type: string
                      description: >-
                        The video prompt, used to describe the visual content,
                        style, cinematography, or character actions of the
                        target video.
                      examples:
                        - >-
                          Generate a short video of a futuristic city at night,
                          with the camera slowly pushing forward as a character
                          emerges from a neon-lit street.
                      maxLength: 20000
                    image_urls:
                      type: array
                      items:
                        type: string
                        format: uri
                      description: >-
                        An array of image URLs. Multiple reference images can be
                        uploaded to provide references for characters, scenes,
                        styles, or storyboards.

                        Image limitations:

                        - Each file must not exceed `20MB`

                        - Use publicly accessible image URLs

                        - Maximum of 7 images

                        - Note: This field is mutually exclusive with the
                        first-frame image (`first_frame_url`) and cannot be
                        provided at the same time.
                      examples:
                        - - https://example.com/assets/scene-1.png
                          - https://example.com/assets/scene-2.png
                    first_frame_url:
                      type: string
                      format: uri
                      description: >-
                        The URL of the first-frame image. Used to specify the
                        starting frame of the generated video. Note: This field
                        is mutually exclusive with `image_urls`, `audio_ids`,
                        `video_list`, and `character_ids` and cannot be provided
                        at the same time.
                      examples:
                        - https://example.com/assets/first-frame.png
                    last_frame_url:
                      type: string
                      format: uri
                      description: >-
                        The URL of the last-frame image. Used to specify the
                        ending frame of the generated video. Note: The
                        last-frame image cannot be used alone and must be
                        provided together with the first-frame image
                        (`first_frame_url`).
                      examples:
                        - https://example.com/assets/last-frame.png
                    audio_ids:
                      type: array
                      items:
                        type: string
                      description: >-
                        An array of audio IDs generated by the
                        `gemini-omni-audio` interface. Used to provide
                        narration, dialogue, background music, or sound
                        references for the video. Up to 3 items. Note: This
                        field is mutually exclusive with the first-frame image
                        (`first_frame_url`) and cannot be provided at the same
                        time.
                      examples:
                        - - audio_01hx8p0demo
                    video_list:
                      type: array
                      items:
                        type: object
                        required:
                          - url
                          - start
                          - ends
                        properties:
                          url:
                            type: string
                            format: uri
                            description: >-
                              The video URL. Each video file must not exceed
                              `100MB`, and the video duration must not exceed
                              `30s`.
                          start:
                            type: number
                            minimum: 0
                            description: The start time, in seconds.
                          ends:
                            type: number
                            minimum: 0
                            description: >-
                              The end time, in seconds. It should be greater
                              than `start`. The difference between the end and
                              start times must not exceed 10 seconds.
                                                                      description: >-
                        An array of video clips. Each element describes a video
                        asset that can be used for generation and its trimming
                        time range.

                        Video limitations:

                        - Each file must not exceed `100MB`

                        - Video duration must not exceed `30s`

                        - `ends` should be greater than `start`

                        - The difference between the end and start times must
                        not exceed `10s`

                        - Maximum of 1 item, occupying two image slots

                        - Note: This field is mutually exclusive with the
                        first-frame image (`first_frame_url`) and cannot be
                        provided at the same time.
                      examples:
                        - - url: https://example.com/assets/source-video.mp4
                            start: 0
                            ends: 10
                    character_ids:
                      type: array
                      items:
                        type: string
                      description: >-
                        An array of character IDs generated by the
                        `gemini-omni-character` interface. Used to provide
                        character appearance, identity, or person references for
                        the video. Up to 3 character IDs. Each uses 1 image slot
                        (2 if created with portrait + body images). Total slots
                        (images + videos × 2 + character slots) ≤ 7. Note: This
                        field is mutually exclusive with the first-frame image
                        (`first_frame_url`) and cannot be provided at the same
                        time.
                      examples:
                        - - character_01hx8p0demo
                    duration:
                      type: string
                      enum:
                        - '4'
                        - '6'
                        - '8'
                        - '10'
                      description: >-
                        The duration of the generated video, in seconds. Valid
                        values are 4, 6, 8, and 10.

                        This parameter only takes effect when there is no video
                        input. If video input is used, the output duration is
                        determined by the model, and the `duration` parameter
                        will be ignored. Note: When video input is provided, the
                        output duration is automatically determined by the
                        model. In this case, the `duration` parameter will not
                        take effect.
                      examples:
                        - '8'
                    aspect_ratio:
                      type: string
                      enum:
                        - '16:9'
                        - '9:16'
                      description: >-
                        The aspect ratio of the generated video. `16:9` is
                        landscape, and `9:16` is portrait.
                      examples:
                        - '16:9'
                    resolution:
                      type: string
                      enum:
                        - 360p
                        - 720p
                        - 1080p
                        - 4k
                      description: >-
                        The resolution of the generated video. Valid values are
                        360p, 720p, 1080p, and 4k.
                      default: 720p
                      examples:
                        - 720p
                    seed:
                      type: integer
                      description: >-
                        The random seed. Valid range: [0, 2147483647]. If not
                        specified, the system will automatically generate a
                        seed. A fixed seed can improve result reproducibility,
                        but because the model itself is stochastic, results may
                        still vary.
                                    required:
                    - prompt
                    - duration
                  dependencies:
                    last_frame_url:
                      - first_frame_url
                                                          example:
              model: google/gemini-omni-flash-1-1
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  Create a futuristic night city short film with a slow push-in
                  shot as the character walks out from a neon-lit street.
                image_urls:
                  - https://example.com/assets/scene-1.png
                  - https://example.com/assets/scene-2.png
                audio_ids:
                  - audio_01hx8p0demo
                video_list:
                  - url: https://example.com/assets/source-video.mp4
                    start: 0
                    ends: 10
                duration: '4'

=====

# Video Models > Gemini Omni > Gemini Omni Video
Fuente: https://docs.kie.ai/market/gemini-omni-video.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Gemini Omni Video
      description: >+
        ## Create Task

        Use this endpoint to create a new multimodal video generation task.

        

        ::: tip[]

        For production use, we recommend providing the `callBackUrl` parameter
        so your service can receive completion notifications instead of polling
        for task status.

        :::

        ## Related Resources

        
          
        </CardGroup>

        **Total Quota Overview:**

        The system utilizes a quota-based system for content uploads. The total
        available capacity is **7 units**. Different parameters consume
        different amounts of this quota. Please ensure the sum of all consumed
        units does not exceed 7.

        **Quota Consumption Rules:**

        1.  **Images (`image_urls`)**: Each image consumes **1 unit**.

        2.  **Videos (`video_list`)**: Each video consumes **2 units**.
            *   *Note: Maximum of 1 video per request.*
        3.  **Character IDs (`character_ids`)**: Each ID consumes **1 unit**.
            *   *Note: Maximum of 3 character IDs per request.*

        **Constraint Formula:**

        `(Number of Images) + (Number of Videos × 2) + (Number of Character IDs)
        ≤ 7`

        **Example Scenarios:**

        *   If 1 video (2 units) and 3 Character IDs (3 units) are uploaded, you
        can upload a maximum of 2 additional images.

        *   If no video or Character IDs are provided, you can upload up to 7
        images.

      operationId: gemini-omni-video
      tags:
        - docs/en/Market/Video Models/Gemini Omni
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  enum:
                    - gemini-omni-video
                  default: gemini-omni-video
                  description: >-
                    The model name used for generation. This field is required.
                    This endpoint must use the `gemini-omni-video` model.
                  examples:
                    - gemini-omni-video
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    Callback URL for task completion notifications. Optional
                    parameter. If provided, the system will send a POST request
                    to this URL when the task completes, whether it succeeds or
                    fails. If omitted, no callback notification will be sent.
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the multimodal video generation task.
                  properties:
                    prompt:
                      type: string
                      description: >-
                        Video prompt used to describe the target content, style,
                        camera language, or character actions in the generated
                        video.
                      examples:
                        - >-
                          Create a futuristic night city short film with a slow
                          push-in shot as the character walks out from a
                          neon-lit street.
                      maxLength: 20000
                    image_urls:
                      type: array
                      items:
                        type: string
                        format: uri
                      description: >-
                        Array of image URLs. You can provide one or more
                        reference images for characters, scenes, styles, or
                        storyboard guidance.

                        Image limits:

                        - Each file must be no larger than `20MB`

                        - Use publicly accessible image URLs

                        - Max 7 images
                      examples:
                        - - https://example.com/assets/scene-1.png
                          - https://example.com/assets/scene-2.png
                    audio_ids:
                      type: array
                      items:
                        type: string
                      description: >-
                        Array of audio IDs generated by the `gemini-omni-audio`
                        endpoint. Useful for narration, dialogue, music, or
                        audio guidance in the generated video. Max 3 items.
                      examples:
                        - - audio_01hx8p0demo
                    video_list:
                      type: array
                      items:
                        type: object
                        required:
                          - url
                          - start
                          - ends
                        properties:
                          url:
                            type: string
                            format: uri
                            description: >-
                              Video URL. Each source video file must be no
                              larger than `100MB` and no longer than `30s`.
                          start:
                            type: number
                            minimum: 0
                            description: Start time in seconds.
                          ends:
                            type: number
                            minimum: 0
                            description: >-
                              End time in seconds. It should be greater than
                              `start`.The difference between the end time and
                              the start time must not exceed 10s
                                                                      description: >-
                        Array of video clips. Each item defines a source video
                        and the trim range to use during generation.

                        Video limits:

                        - Each file must be no larger than `100MB`

                        - Video duration must not exceed `30s`

                        - `ends` should be greater than `start`

                        - The difference between the end time and the start time
                        must not exceed `10s`.

                        - Max 1 items. Equal 2 images
                      examples:
                        - - url: https://example.com/assets/source-video.mp4
                            start: 0
                            ends: 10
                    character_ids:
                      type: array
                      items:
                        type: string
                      description: >-
                        An array of character IDs generated by the
                        `gemini-omni-character` API. Used to provide character
                        appearance, identity, or person references for the
                        video. Up to 3 character IDs. Each uses 1 image slot (2
                        if created with portrait + body images). Total slots
                        (images + videos × 2 + character slots) ≤ 7.
                      examples:
                        - - character_01hx8p0demo
                    duration:
                      type: string
                      enum:
                        - '4'
                        - '6'
                        - '8'
                        - '10'
                      description: >-
                        The duration of the generated video in seconds.
                        Available values are 4, 6, 8, and 10. When video input
                        is provided, the output duration is determined by the
                        model automatically. This duration parameter will not
                        take effect.Note: when video input is provided, the
                        output duration is determined by the model
                        automatically. This duration parameter will not take
                        effect.
                      examples:
                        - '8'
                    aspect_ratio:
                      type: string
                      enum:
                        - '16:9'
                        - '9:16'
                      description: >-
                        The aspect ratio of the generated video. `16:9` is
                        landscape, and `9:16` is portrait.
                      examples:
                        - '16:9'
                    resolution:
                      type: string
                      enum:
                        - 720p
                        - 1080p
                        - 4k
                      description: >-
                        The resolution of the generated video. Available values
                        are 720p, 1080p, and 4k.
                      default: 720p
                      examples:
                        - 720p
                    seed:
                      type: integer
                      description: >-
                        Random seed. Range: [0, 2147483647]. If not specified,
                        the system generates a seed automatically. Fixing the
                        seed can improve reproducibility, but results may still
                        vary due to the model’s stochasticity.
                                    required:
                    - prompt
                    - duration
                                                          example:
              model: gemini-omni-video
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  Create a futuristic night city short film with a slow push-in
                  shot as the character walks out from a neon-lit street.
                image_urls:
                  - https://example.com/assets/scene-1.png
                  - https://example.com/assets/scene-2.png
                audio_ids:
                  - audio_01hx8p0demo
                video_list:
                  - url: https://example.com/assets/source-video.mp4
                    start: 0
                    ends: 10
                duration: '4'

=====

# Video Models > Gemini Omni > Gemini Omni Audio
Fuente: https://docs.kie.ai/market/gemini-omni-audio.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/omni/audio/create:
    post:
      summary: Gemini Omni Audio
      description: >-
        Synchronous. Registers a voice preset and returns data.audioId
        immediately; no audio file is generated. Pass audioId in audio_ids of
        the video and character endpoints.

        Returns data.audioId. Pass it in audio_ids of gemini-omni-video,
        google/gemini-omni-flash-1-1 and gemini-omni-character.

        :::tip

        This endpoint is free.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: gemini-omni-audio
      tags:
        - docs/en/Market/Video Models/Gemini Omni
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - audio_id
                - name
              properties:
                audio_id:
                  type: string
                  description: |-
                    Enum voice ID, used to select a preset voice character.
                     achernar - female, soft, high pitch 
                      achird - male, friendly, mid pitch 
                      algenib - male, raspy, low pitch 
                     algieba - male, easygoing, mid-low pitch  
                     alnilam - male, steady, mid-low pitch 
                     aoede - female, brisk, mid pitch 
                     autonoe - female, bright, mid pitch 
                     callirrhoe - female, easygoing, mid pitch 
                     charon - male, intellectual, low pitch 
                      despina - female, smooth, mid  pitch 
                     enceladus - male, breathy, low pitch 
                     erinome - female, clear, mid pitch 
                     fenrir -  male, lively, younger pitch 
                     gacrux - female, mature, mid pitch 
                     iapetus - male, clear, mid-low pitch 
                     kore - female, capable, mid pitch  
                      laomedeia - female, cheerful, mid-high pitch 
                     leda - female, young, mid-high pitch 
                     orus - male, steady, mid-low pitch 
                     puck - male, cheerful, mid pitch 
                     pulcherrima - genderless, forward, mid-high pitch 
                     rasalgethi - male, intellectual, mid pitch 
                     sadachbia -  male, vivid, low pitch 
                     sadaltager - male, knowledgeable, mid pitch 
                      schedar - male, smooth, mid-low pitch 
                     sulafat - female, warm, mid pitch 
                      umbriel - male, smooth, low pitch 
                      vindemiatrix - female, gentle, mid pitch 
                     zephyr - female, bright, mid-high pitch 
                     zubenelgenubi -   male, casual, mid-low pitch
                  examples:
                    - achernar
                    - achird
                    - algenib
                    - algieba
                    - alnilam
                    - aoede
                    - autonoe
                    - callirrhoe
                    - charon
                    - despina
                    - enceladus
                    - erinome
                    - fenrir
                    - gacrux
                    - iapetus
                    - kore
                    - laomedeia
                    - leda
                    - orus
                    - puck
                    - pulcherrima
                    - rasalgethi
                    - sadachbia
                    - sadaltager
                    - schedar
                    - sulafat
                    - umbriel
                    - vindemiatrix
                    - zephyr
                    - zubenelgenubi
                name:
                  type: string
                  description: 'Voice name. Maximum length: `210` characters.'
                voice_description:
                  type: string
                  description: >-
                    Voice characteristic description used to define timbre,
                    style, speaking rate, emotion, and other traits. Maximum
                    length: `20000` characters.
                example_dialogue:
                  type: string
                  description: >-
                    Example dialogue, such as "Hello, I am Adam". Maximum
                    length: `120` characters.
                          example:
              audio_id: achernar
              name: achernar Narrator
              voice_description: >-
                A calm, clear, and friendly male voice suitable for tech
                explainers and daily conversation.
              example_dialogue: Hello, I am achernar

=====

# Video Models > Gemini Omni > Gemini Omni Character
Fuente: https://docs.kie.ai/market/gemini-omni-character.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/omni/character/create:
    post:
      summary: Gemini Omni Character
      description: >-
        - image_urls supports 1–2 images (index 0 portrait, index 1 optional
        full-body), each up to 20MB.

        - `audio_ids` must come from the `gemini-omni-audio` endpoint

        ## Create Task

        Use this endpoint to create a new character.

        :::tip

        This endpoint is free.

        :::

        ## Related Resources

        
          
        </CardGroup>
      operationId: gemini-omni-character
      tags:
        - docs/en/Market/Video Models/Gemini Omni
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - descriptions
                - image_urls
              properties:
                descriptions:
                  type: string
                  description: >-
                    Character description used to define the appearance,
                    identity, style, clothing, or personality of the character.
                  examples:
                    - >-
                      A young female character with short silver hair and a
                      futuristic utility jacket, calm, agile, and strongly
                      cyberpunk in style.
                image_urls:
                  type: array
                  maxItems: 2
                  minItems: 1
                  items:
                    type: string
                    format: uri
                  description: >-
                    Array of character reference image URLs. Up to 2 images are
                    supported. Index 0 is the portrait image, and index 1 is the
                    body image. The body image is optional, but if provided, the
                    portrait image must be present at index 0.

                    Image limits:

                    - Each image must be no larger than `20MB`

                    - Use a publicly accessible image URL
                  examples:
                    - - https://example.com/assets/character-portrait.png
                      - https://example.com/assets/character-body.png
                audio_ids:
                  type: array
                  items:
                    type: string
                  description: >-
                    Array of audio IDs generated by the `gemini-omni-audio`
                    endpoint. These can be used to provide voice traits, tone,
                    or persona guidance for the character.
                  examples:
                    - - audio_01hx8p0demo
                character_name:
                  type: string
                  description: Character name
                          example:
              description: >-
                A young female character with short silver hair and a futuristic
                utility jacket, calm, agile, and strongly cyberpunk in style.
              image_urls:
                - https://example.com/assets/character-reference.png
              audio_ids:
                - audio_01hx8p0demo
              character_name: Jenny

=====

# Video Models > Veo3.1 API > Generate Veo3.1 Video
Fuente: https://docs.kie.ai/veo3-api/generate-veo-3-video.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Generate Veo3.1 Video
      description: >
        :::warning

        This is the new version of the API documentation; for the old version of
        the API, please see
        [https://docs.kie.ai/old-model/veo3-api/generate-veo-3-video](https://docs.kie.ai/old-model/veo3-api/generate-veo-3-video).

        :::

        ### Veo 3.1 Generation API

        Our **Veo 3.1 Generation API** is more than a direct wrapper around
        Google's baseline. It layers extensive optimisation and reliability
        tooling on top of the official models, giving you greater flexibility
        and markedly higher success rates (see
        [kie.ai/pricing](https://kie.ai/pricing) for full details).

        | Capability | Details |

        | :------------------- | :------ |

        | **Models** | • **Veo 3.1 Quality** — flagship model, highest fidelity•
        **Veo 3.1 Fast** — cost-efficient variant that still delivers strong
        visual results• **Veo 3.1 Lite** — most cost-effective model for
        high-volume generation |

        | **Tasks** | • **Text → Video**• **Image → Video** (single reference
        frame or first and last frames)• **Material → Video** (based on material
        images) |

        | **Generation Modes** | • **TEXT\_2\_VIDEO** — Text-to-video: using
        text prompts only• **FIRST\_AND\_LAST\_FRAMES\_2\_VIDEO** — First and
        last frames to video: generate transition videos using one or two
        images• **REFERENCE\_2\_VIDEO** — Material-to-video: based on material
        images (**Fast model** and **Lite model**, supports **16:9 & 9:16**) |

        | **Aspect Ratios** | Supports both native **16:9** and **9:16**
        outputs. **Auto** mode lets the system decide aspect ratio based on
        input materials and internal strategy (for production control, we
        recommend explicitly setting `aspect_ratio`). |

        | **Output Quality** | Both **16:9** and **9:16** support **1080P** and
        **4K** outputs.|

        | **Audio Track** | All videos ship with background audio by default. In
        rare cases, audio may be suppressed when the scene is deemed sensitive
        (e.g. minors). |

        ### Why our Veo 3.1 API is different

        1. **True vertical video** – Native Veo 3.1 supports **9:16** output,
        delivering authentic vertical videos without the need for re-framing or
        manual editing.

        2. **Global language reach** – Our flow supports multilingual prompts by
        default (no extra configuration required).

        3. **Significant cost savings** – see
        [kie.ai/pricing](https://kie.ai/pricing) for current prices.

        :::tip

        Choosing 1080p or 4k at generation costs the 720p price plus the 1080P /
        4K upgrade price. For current prices, see
        [kie.ai/pricing](https://kie.ai/pricing).

        :::
      operationId: generate-veo3-1-video
      tags:
        - docs/en/Market/Video Models/Veo3.1 API
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                model:
                  type: string
                  description: >-
                    Must be "veo-3-1". Use input.model to choose the Fast / Lite
                    / Quality tier.
                  default: veo-3-1
                  examples:
                    - veo-3-1
                  enum:
                    - veo-3-1
                callBackUrl:
                  type: string
                  description: >-
                    Completion callback URL for receiving video generation
                    status updates.

                    - Optional but recommended for production use

                    - System will POST task completion status to this URL when
                    the video generation is completed

                    - Callback will include task results, video URLs, and status
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload

                    - For detailed callback format and implementation guide, see
                    [Callback
                    Documentation](https://docs.kie.ai/veo3-api/generate-veo-3-video-callbacks)

                    - Alternatively, poll Get Task Details
                    (/market/common/get-task-detail).

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - http://your-callback-url.com/complete
                input:
                  type: object
                  properties:
                    prompt:
                      type: string
                      description: >-
                        Text prompt describing the desired video content.
                        Required for all generation modes.

                        - Should be detailed and specific in describing video
                        content

                        - Can include actions, scenes, style and other
                        information

                        - For image-to-video, describe how you want the image to
                        come alive
                      examples:
                        - A dog playing in a park
                    model:
                      type: string
                      enum:
                        - veo3_fast
                        - veo3_lite
                        - veo3
                      default: veo3_fast
                      description: >-
                        Veo 3.1 tier: "veo3_fast" (default), "veo3_lite" or
                        "veo3" (Quality). The top-level model stays "veo-3-1".
                        REFERENCE_2_VIDEO supports veo3_fast and veo3_lite.
                      examples:
                        - veo3_fast
                    image_urls:
                      type: array
                      items:
                        type: string
                      description: >-
                        Image URLs. FIRST_AND_LAST_FRAMES_2_VIDEO: 1 image
                        (first frame) or 2 images (first + last frame).
                        REFERENCE_2_VIDEO: 1–3 reference images, 8-second
                        duration only.
                      examples:
                        - - http://example.com/image1.jpg
                          - http://example.com/image2.jpg
                    generation_type:
                      type: string
                      description: >-
                        Video generation mode (optional). Specifies different
                        video generation approaches:

                        - **TEXT_2_VIDEO**: Text-to-video - Generate videos
                        using only text prompts

                        - **FIRST_AND_LAST_FRAMES_2_VIDEO**: First and last
                        frames to video - Flexible image-to-video generation
                        mode
                          - 1 image: Generate video based on the provided image
                          - 2 images: First image as first frame, second image as last frame, generating transition video
                        - **REFERENCE_2_VIDEO**: Reference-to-video - Generate
                        videos based on reference images, requires 1-3 images in
                        imageUrls (minimum 1, maximum 3)

                        **Important Notes**:

                        - REFERENCE_2_VIDEO mode currently supports the
                        veo3_fast and veo3_lite models.

                        - If not specified, the system will automatically
                        determine the generation mode based on whether imageUrls
                        are provided
                      enum:
                        - TEXT_2_VIDEO
                        - FIRST_AND_LAST_FRAMES_2_VIDEO
                        - REFERENCE_2_VIDEO
                      examples:
                        - TEXT_2_VIDEO
                    aspect_ratio:
                      type: string
                      description: >-
                        Video aspect ratio. Specifies the dimension ratio of the
                        generated video. Available options:

                        - 16:9: Landscape video format. 

                        - 9:16: Portrait video format, suitable for mobile short
                        videos

                        - Auto: In auto mode, the video will be automatically
                        center-cropped based on whether your uploaded image is
                        closer to 16:9 or 9:16.

                        Default value is 16:9.
                      enum:
                        - '16:9'
                        - '9:16'
                        - Auto
                      default: '16:9'
                      examples:
                        - '16:9'
                    enable_fallback:
                      type: boolean
                      description: Deprecated. Remove it from requests.
                      default: false
                      deprecated: true
                      examples:
                        - false
                    enable_translation:
                      type: boolean
                      description: >-
                        Optional. When true, the prompt is translated to English
                        before generation.
                      examples:
                        - true
                    watermark:
                      type: string
                      description: >-
                        Watermark text.

                        - Optional parameter

                        - If provided, a watermark will be added to the
                        generated video
                      examples:
                        - MyBrand
                    resolution:
                      type: string
                      enum:
                        - 720p
                        - 1080p
                        - 4k
                                                name: ''
                          description: ''
                        - value: 1080p
                          name: ''
                          description: ''
                        - value: 4k
                          name: ''
                          description: ''
                      default: 720p
                      description: >-
                        Output resolution: 720p (default), 1080p or 4k. For
                        1080p and 4k, the video URL is in
                        resultJson.data.result_urls (the 720p version is in
                        data.origin_urls). Controls the pixel dimensions of the
                        generated video. Higher resolution results in greater
                        clarity and detail, while lower resolution allows for
                        faster generation.
                    duration:
                      type: integer
                      description: >-
                        The duration of the generated video, in seconds.
                        Optional values are 4, 6, 8.

                        **Important Note**:

                        - The REFERENCE_2_VIDEO mode currently only supports a
                        duration of 8 seconds.
                      enum:
                        - 4
                        - 6
                        - 8
                      examples:
                        - 8
                      default: 8
                  required:
                    - prompt
                                                  required:
                - model
                - input
                            examples:
                - model: veo-3-1
                  callBackUrl: http://your-callback-url.com/complete
                  input:
                    prompt: A dog playing in a park
                    image_urls:
                      - http://example.com/image1.jpg
                      - http://example.com/image2.jpg
                    watermark: MyBrand
                    aspect_ratio: '16:9'
                    enable_translation: true
                    generation_type: REFERENCE_2_VIDEO
                          example:
              model: veo-3-1
              callBackUrl: http://your-callback-url.com/complete
              input:
                prompt: A dog playing in a park
                image_urls:
                  - http://example.com/image1.jpg
                  - http://example.com/image2.jpg
                watermark: MyBrand
                aspect_ratio: '16:9'
                enable_translation: true
                generation_type: REFERENCE_2_VIDEO

=====

# Video Models > Veo3.1 API > Get 1080P Video
Fuente: https://docs.kie.ai/veo3-api/get-veo-3-1080-p-video.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Get 1080P Video
      description: >
        :::warning

        This is the new version of the API documentation; for the old version of
        the API, please see
        [https://docs.kie.ai/old-model/veo3-api/get-veo-3-1080-p-video](https://docs.kie.ai/old-model/veo3-api/get-veo-3-1080-p-video).

        :::

        ::: info[]
          Get the high-definition 1080P version of a Veo 3.1 video generation task.
        :::

        ### Usage Instructions

        * 1080P generation requires extra processing time — typically **~1–3
        minutes** depending on load.

        * Creates an asynchronous 1080P task and returns a taskId. Get the
        result from Get Task Details: resultJson.resultUrls[0]. If a 1080P
        version already exists, it is returned directly in data.resultUrl.
        callBackUrl is optional.

        * Make sure the **original generation task is successful** before
        requesting 1080P.

        :::tip

        Choosing 1080p or 4k at generation costs the 720p price plus the 1080P /
        4K upgrade price. For current prices, see
        [kie.ai/pricing](https://kie.ai/pricing).

        :::
      operationId: get-veo3-1-1080p-video
      tags:
        - docs/en/Market/Video Models/Veo3.1 API
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                model:
                  type: string
                  description: Model name; the fixed value here is veo/get-1080p-video.
                  examples:
                    - veo/get-1080p-video
                callBackUrl:
                  type: string
                  description: >-
                    Callback URL for task completion notifications. Optional
                    parameter. If provided, the system will send a POST request
                    to this URL when the task completes, whether it succeeds or
                    fails. If omitted, no callback notification will be sent.
                input:
                  type: object
                  properties:
                    taskId:
                      type: string
                      description: taskId
                    index:
                      type: string
                      description: video index
                                    required:
                    - taskId
                                              required:
                - model
                - input
                          example:
              model: veo/get-1080p-video
              callBackUrl: https://your-domain.com/api/callback
              input:
                taskId: <taskId of a successful generation task>
                index: 0

=====

# Video Models > Veo3.1 API > Get 4K Video
Fuente: https://docs.kie.ai/veo3-api/get-veo-3-4k-video.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Get 4K Video
      description: >-
        :::warning

        This is the new version of the API documentation; for the old version of
        the API, please see
        [https://docs.kie.ai/old-model/veo3-api/get-veo-3-4k-video](https://docs.kie.ai/old-model/veo3-api/get-veo-3-4k-video).

        :::

        ::: info[]
          Get the ultra-high-definition 4K version of a Veo 3.1 video generation task.
        :::

        ### Usage Instructions

        * **Supported aspect ratios**
          * Both **16:9** and **9:16** tasks support upgrading to **1080P** and **4K**.
        * **Processing time**
          * 4K generation requires significant extra processing time — typically **~5–10 minutes** depending on load.
        * If the 4K video is not ready yet, the endpoint may return a non-200
        code. Wait and retry (recommended interval: **30s+**) until the result
        is available.

        ::: tip[]
          For production use, we recommend using `callBackUrl` to receive automatic notifications when 4K generation completes, rather than polling frequently.
        :::

        :::tip

        Choosing 1080p or 4k at generation costs the 720p price plus the 1080P /
        4K upgrade price. For current prices, see
        [kie.ai/pricing](https://kie.ai/pricing).

        :::

        ## Callbacks

        After submitting a 4K video generation task, use the unified callback
        mechanism to receive generation completion notifications:

        

        ## Error Responses

        When submitting repeated requests for the same task ID, the system
        returns a `422` status code with specific error details:

        <Tabs>
          <TabItem value="processing" label="4K Video Processing">
            ```json
            {
              "code": 422,
              "msg": "4k is processing. It should be ready in 5-10 minutes. Please check back shortly.",
              "data": {
                "taskId": "veo_task_example123",
                "resultUrls": null,
                "imageUrls": null
              }
            }
            ```
          </TabItem>
          <TabItem value="generated" label="4K Video Already Generated">
            ```json
            {
              "code": 422,
              "msg": "The video has been generated successfully",
              "data": {
                "taskId": "veo_task_example123",
                "resultUrls": [
                  "https://tempfile.aiquickdraw.com/v/example_task_1234567890.mp4"
                ],
                "imageUrls": [
                  "https://tempfile.aiquickdraw.com/v/example_task_1234567890.jpg"
                ]
              }
            }
            ```
          </TabItem>
        </Tabs>
      operationId: get-veo3-1-4k-video
      tags:
        - docs/en/Market/Video Models/Veo3.1 API
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  default: veo/get-4k-video
                  description: 'Fixed: veo/get-4k-video.'
                  examples:
                    - veo/get-4k-video
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive 4K video generation task completion
                    updates. Optional but recommended for production use.

                    - System will POST task status and results to this URL when
                    4K video generation completes

                    - Callback includes generated video URLs, media IDs, and
                    related information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, poll Get Task Details
                    (/market/common/get-task-detail).

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - http://your-callback-url.com/4k-callback
                input:
                  type: object
                  required:
                    - task_id
                  properties:
                    task_id:
                      type: string
                      description: Task ID
                      examples:
                        - veo_task_abcdef123456
                    index:
                      type: integer
                      description: video index
                      default: 0
                      examples:
                        - 0
                                                                            example:
              model: veo/get-4k-video
              callBackUrl: http://your-callback-url.com/4k-callback
              input:
                task_id: veo_task_abcdef123456
                index: 0

=====

# Video Models > Veo3.1 API > Extend Veo3.1 Video
Fuente: https://docs.kie.ai/veo3-api/extend-video.md
=====

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Extend Veo3.1 Video
      description: >
        :::warning

        This is the new version of the API documentation; for the old version of
        the API, please see
        [https://docs.kie.ai/old-model/veo3-api/extend-video](https://docs.kie.ai/old-model/veo3-api/extend-video).

        :::

        ::: info[]
          Extend an existing Veo 3.1 video by generating new content based on the original video and a text prompt. This feature allows you to extend video duration or add new content based on your existing video clips.
        :::

        The result (resultUrls) is the newly generated continuation clip (720p)
        that starts from the last frame of the source video. The callback
        additionally includes info.fullResultUrls with the source and the
        continuation stitched together.

        Our **Veo 3.1 Video Extension API** is more than simple video splicing.
        It layers intelligent extension algorithms on top of the official
        models, giving you greater flexibility and markedly higher success rates
        (see [pricing details](https://kie.ai/pricing) for full details).

        | Capability              | Details |

        | :---------------------- | :------ |

        | **Smart Extension**     | Generate new video segments based on
        existing videos and text prompts |

        | **Seamless Connection** | Extended videos naturally connect with the
        original video |

        | **Flexible Control**    | Precisely control the style and actions of
        extended content through prompts |

        | **High-Quality Output** | Maintain the same quality and style as the
        original video |

        | **Audio Track**         | Extended videos default to background audio,
        consistent with the original video |

        ### Why our Veo 3.1 Video Extension is different

        1. **Smart Content Understanding** – Deeply understands the content and
        style of the original video to ensure coherence of extended content.

        2. **Natural Transition** – Extended video segments seamlessly connect
        with the original video without visible splicing marks.

        3. **Flexible Control** – Precisely control the actions, scenes, and
        styles of extended content through detailed prompts.

        4. **Significant Cost Savings** – see
        [kie.ai/pricing](https://kie.ai/pricing) for current prices.

        :::tip

        Choosing 1080p or 4k at generation costs the 720p price plus the 1080P /
        4K upgrade price. For current prices, see
        [kie.ai/pricing](https://kie.ai/pricing).

        :::

        ***

        ### Video Extension Workflow

        The video extension feature is based on your existing Veo3.1 generated
        videos and works through the following steps:

        1. **Provide Original Video**: Use the `taskId` from the original video
        generation task

        2. **Describe Extension Content**: Use `prompt` to detail how you want
        the video to be extended

        3. **Smart Analysis**: The system analyzes the content, style, and
        actions of the original video

        4. **Generate Extension**: Generate new video segments based on analysis
        results and your prompts

        5. **Seamless Connection**: Naturally connect the extended video with
        the original video

        ### Extension Features

        ::: info[Through the video extension feature, you can:]

        - Extend video duration and add more content

        - Change video direction and add new actions or scenes

        - Add new elements while maintaining the original style

        - Create richer video stories

        :::

        **Extension Features:**

        - **Smart Analysis**: Deeply understand the content and style of the
        original video

        - **Natural Connection**: Extended content seamlessly connects with the
        original video

        - **Flexible Control**: Precisely control extended content through
        prompts

        - **Quality Assurance**: Maintain the same quality and style as the
        original video

        ::: warning[**Important Notes**]

        - Can only extend videos generated through the Veo3.1 API

        - Extended content must also comply with platform content policies

        - Recommend using English prompts for best results

        - Video extension consumes credits, see [pricing
        Details](https://kie.ai/pricing) for specific pricing

        :::

        ### Best Practices

        ::: tip[Prompt Writing Suggestions]

        1. **Detailed Action Description**: Clearly describe how you want the
        video to be extended, e.g., "the dog continues running through the park,
        jumping over obstacles"

        2. **Maintain Style Consistency**: Ensure the style of extended content
        matches the original video

        3. **Natural Transition**: Described actions should naturally connect
        with the end of the original video

        4. **Use English**: Recommend using English prompts for best results

        5. **Avoid Conflicts**: Ensure extended content doesn't create logical
        conflicts with the original video

        :::

        ::: tip[Technical Recommendations]

        1. **Use Callbacks**: Strongly recommend using callback mechanisms to
        get results in production environments

        2. **Download Promptly**: Download video files promptly after
        generation, URLs have time limits

        3. **Error Handling**: Implement appropriate error handling and retry
        mechanisms

        4. **Credit Management**: Monitor credit usage to ensure sufficient
        balance

        5. **Seed Control**: Use the seeds parameter to control the randomness
        of generated content

        :::

        ## Important Notes

        ::: warning[Important Limitations]

        - **Original Video Requirements**: Can only extend videos generated
        through the Veo3.1 API

        - **Content Policy**: Extended content must also comply with platform
        content policies

        - **Credit Consumption**: Video extension consumes credits, see [pricing
        Details](https://kie.ai/pricing) for specific pricing

        - **Processing Time**: Video extension may take several minutes to over
        ten minutes to process

        - **URL Validity**: Generated video URLs have time limits, please
        download and save promptly

        :::

        ::: note[Extended Video Features]

        - **Seamless Connection**: Extended videos will naturally connect with
        the original video

        - **Quality Maintenance**: Extended videos maintain the same quality as
        the original video

        - **Style Consistency**: Extended content will maintain the visual style
        of the original video

        - **Flexible Control**: Prompts can precisely control the content and
        direction of extension

        :::

        ## Troubleshooting

        <AccordionGroup>

        <Accordion title="Common Error Handling">

        - **404 Error**: Check that task_id is a successful Veo 3.1 task.

        - **400 Error**: Check if the prompt complies with content policies

        - **402 Error**: Confirm the account has sufficient credits

        - **500 Error**: Temporary server issue, please try again later

        </Accordion>

        <Accordion title="Extension Quality Issues">

        - **Unnatural Connection**: Try more detailed prompt descriptions

        - **Style Inconsistency**: Ensure the prompt includes style descriptions

        - **Disconnected Actions**: Check if action descriptions in the prompt
        are reasonable

        - **Content Deviation**: Adjust prompts to more accurately describe
        desired extension content

        </Accordion>

        <Accordion title="Technical Issues">

        - **Callback Receipt Failure**: Check if the callback URL is accessible

        - **Video Download Failure**: Confirm URL validity and network
        connection

        - **Abnormal Task Status**: Use the details query interface to check
        task status

        - **Insufficient Credits**: Recharge credits promptly to continue using
        the service

        </Accordion>

        </AccordionGroup>
      operationId: extend-veo3-1-video
      tags:
        - docs/en/Market/Video Models/Veo3.1 API
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                model:
                  type: string
                  description: The outer model name, fixed to veo/extend
                  default: veo/extend
                  examples:
                    - veo/extend
                callBackUrl:
                  type: string
                  description: >-
                    Callback URL when the task is completed (optional). Highly
                    recommended for use in production environments.

                    - When the video extension is completed, the system will
                    send a POST request containing the task status and results
                    to this URL

                    - The callback includes the generated video URL, task
                    information, etc.

                    - Your callback endpoint should accept a POST request with a
                    JSON payload containing the video results

                    - For detailed callback format and implementation
                    guidelines, see [Video Generation
                    Callbacks](https://docs.kie.ai/veo3-api/generate-veo-3-video-callbacks)

                    - Alternatively, poll Get Task Details
                    (/market/common/get-task-detail).

                    - To ensure callback security, please refer to the [Webhook
                    Verification Guide](/common-api/webhook-verification) for
                    signature verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  properties:
                    task_id:
                      type: string
                      description: >-
                        The task ID of the original video generation. Must be a
                        valid task ID returned by the video generation API.
                      examples:
                        - veo_task_abcdef123456
                    prompt:
                      type: string
                      description: >-
                        A text prompt describing the content of the extended
                        video. It should detail how you want the video to be
                        extended, including actions, scene changes, styles, etc.
                      examples:
                        - >-
                          The dog continues running through the park, jumping
                          over obstacles and playing with other dogs
                    seeds:
                      type: integer
                      description: >-
                        A random seed parameter that controls the randomness of
                        the generated content. Range: 10000-99999. The same seed
                        will generate similar video content, while different
                        seeds will generate different video content. If not
                        specified, the system will automatically assign a random
                        seed.
                      minimum: 10000
                      maximum: 99999
                      examples:
                        - 12345
                    model:
                      type: string
                      description: >-
                        Extension tier: "fast" (default), "quality" or "lite".
                        Billed per extension at the chosen tier.
                      enum:
                        - fast
                        - quality
                        - lite
                      default: fast
                      examples:
                        - fast
                    watermark:
                      type: string
                      description: >-
                        Watermark text (optional). If provided, a watermark will
                        be added to the generated video.
                      examples:
                        - MyBrand
                  required:
                    - task_id
                    - prompt
                                                  required:
                - model
                - input
                            examples:
                - model: veo/extend
                  callBackUrl: https://your-domain.com/api/callback
                  input:
                    task_id: veo_task_abcdef123456
                    prompt: >-
                      The dog continues running through the park, jumping over
                      obstacles and playing with other dogs
                    seeds: 12345
                    watermark: MyBrand
                          example:
              model: veo/extend
              callBackUrl: https://your-domain.com/api/callback
              input:
                task_id: veo_task_abcdef123456
                prompt: >-
                  The dog continues running through the park, jumping over
                  obstacles and playing with other dogs
                seeds: 12345
                watermark: MyBrand

=====
