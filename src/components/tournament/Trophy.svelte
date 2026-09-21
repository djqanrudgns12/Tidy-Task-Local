<script lang="ts">
  let { large = false } = $props<{ large?: boolean }>();
  const uid = $props.id();
</script>

<svg
  class:large
  viewBox="0 0 240 240"
  fill="none"
  role="img"
  aria-label="황금 우승 트로피"
>
  <defs>
    <linearGradient
      id={`${uid}-gold`}
      x1="71"
      y1="45"
      x2="161"
      y2="177"
      gradientUnits="userSpaceOnUse"
      ><stop stop-color="#fff2ae" /><stop
        offset=".36"
        stop-color="#ffd66b"
      /><stop offset=".7" stop-color="#eaa52e" /><stop
        offset="1"
        stop-color="#fff1a4"
      /></linearGradient
    >
    <linearGradient
      id={`${uid}-base`}
      x1="85"
      y1="194"
      x2="162"
      y2="220"
      gradientUnits="userSpaceOnUse"
      ><stop stop-color="#6461b9" /><stop
        offset="1"
        stop-color="#343367"
      /></linearGradient
    >
  </defs>
  <ellipse cx="120" cy="221" rx="69" ry="9" fill="#433373" opacity=".12" />
  <path
    d="M80 66H48v20c0 29 18 46 44 46M160 66h32v20c0 29-18 46-44 46"
    stroke="#cf8a21"
    stroke-width="13"
    stroke-linecap="round"
  />
  <path
    d="M80 63H48v20c0 29 18 46 44 46M160 63h32v20c0 29-18 46-44 46"
    stroke="#ffda72"
    stroke-width="8"
    stroke-linecap="round"
  />
  <path
    d="M72 48h96l-8 66c-3 25-17 43-40 43s-37-18-40-43z"
    fill={`url(#${uid}-gold)`}
    stroke="#c88b29"
    stroke-width="2"
  />
  <path d="M85 57h12l4 72c-9-12-13-32-16-72" fill="white" opacity=".52" />
  <rect
    x="68"
    y="42"
    width="104"
    height="13"
    rx="6.5"
    fill="#ffe69b"
    stroke="#dca73b"
    stroke-width="2"
  />
  <path
    d="M112 155h16v24l17 14H95l17-14z"
    fill={`url(#${uid}-gold)`}
    stroke="#d6a03b"
    stroke-width="2"
  />
  <rect
    x="85"
    y="190"
    width="70"
    height="27"
    rx="6"
    fill={`url(#${uid}-base)`}
  /><rect x="103" y="198" width="34" height="11" rx="3" fill="#ffdc82" />
  <path
    d="m120 75 8 16 18 3-13 13 3 18-16-9-16 9 3-18-13-13 18-3z"
    fill="#fff1b1"
    stroke="#dba032"
    stroke-width="2"
    stroke-linejoin="round"
  />
  <path
    d="m40 142 3-10 3 10 10 3-10 3-3 10-3-10-10-3zm153-111 3-9 3 9 9 3-9 3-3 9-3-9-9-3z"
    fill="#e7b849"
  />
  <circle cx="62" cy="25" r="3" fill="#9997d9" /><circle
    cx="192"
    cy="164"
    r="4"
    fill="#b4ace4"
  />
</svg>

<style>
  svg {
    width: 100%;
    height: 100%;
    overflow: visible;
    filter: drop-shadow(0 12px 16px #a174211a);
  }
  .large {
    filter: drop-shadow(0 20px 35px #ffc95d40);
  }
</style>
